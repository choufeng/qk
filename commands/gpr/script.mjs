#!/usr/bin/env bun

import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'
import { $ } from 'zx'
import { confirm } from '@inquirer/prompts'
import { launch } from '../../lib/ai/index.mjs'
import { ConfigManager } from '../../lib/config/index.mjs'
import {
  isGitRepo,
  getCurrentBranch,
  getMainBranch,
  getBranchCommits,
  getBranchDiff,
  extractTicket,
  pushBranch,
  hasGhCli,
  hasRemoteTracking,
} from '../../lib/git/index.mjs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

$.verbose = false

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPTS_DIR = join(__dirname, '../../configs/prompts')

/**
 * Start a terminal spinner, returns the interval handle
 * @param {string} message
 * @returns {NodeJS.Timeout}
 */
function startSpinner(message) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let i = 0
  process.stdout.write(`${frames[i]} ${message}`)
  return setInterval(() => {
    i = (i + 1) % frames.length
    process.stdout.write(`\r${frames[i]} ${message}`)
  }, 80)
}

/**
 * Stop the spinner and clear the line
 * @param {NodeJS.Timeout} handle
 */
function stopSpinner(handle) {
  clearInterval(handle)
  process.stdout.write('\r\x1b[K') // clear line
}

/**
 * @description AI-powered Pull Request generator
 */
export async function run(args) {
  // Parse flags from args
  const flatArgs = args.flat().filter(a => typeof a === 'string' && !a.includes('Command') && !a.startsWith('{'))
  const dryRun = flatArgs.includes('--dry-run') || flatArgs.includes('-n')
  const noVerify = flatArgs.includes('--no-verify') || flatArgs.includes('-nv')
  const noEdit = flatArgs.includes('--no-edit')

  try {
    // 1. Validate git repo
    if (!(await isGitRepo())) {
      console.error('Error: not a git repository.')
      process.exit(1)
    }

    // 2. Check not on main branch
    const currentBranch = await getCurrentBranch()
    const mainBranch = await getMainBranch()

    if (currentBranch === mainBranch) {
      console.error(`Error: currently on main branch '${mainBranch}'. Switch to a feature branch first.`)
      process.exit(1)
    }

    // 3. Get branch data
    console.log(`Analyzing branch '${currentBranch}'...`)
    const commits = await getBranchCommits()
    const diff = await getBranchDiff()

    if (commits.length === 0 && !diff.trim()) {
      console.log('No changes found vs main branch. Nothing to PR.')
      process.exit(0)
    }

    // 4. Extract ticket
    const ticket = await extractTicket()

    // 5. Load prompt template
    const templatePath = join(PROMPTS_DIR, 'pr.md')
    let template
    try {
      template = readFileSync(templatePath, 'utf-8')
    } catch {
      console.error(`Error: prompt template not found at ${templatePath}`)
      process.exit(1)
    }

    // 6. Build commit summary
    const commitSummary = commits.length > 0
      ? commits.map(c => `- ${c.hash}: ${c.message}`).join('\n')
      : 'No commits found'

    // 7. Build QA section placeholder
    const qaSection = noVerify
      ? '[QA: None]'
      : '{{Based on code changes, determine QA: Verify (UI/user-visible changes) or QA: None (backend/config/docs)}}'

    // 8. Inject placeholders
    const config = new ConfigManager()
    const language = config.get('ai.language') || 'en'
    const provider = config.get('ai.provider')
    const prompt = template
      .replace(/\{\{LANGUAGE\}\}/g, language)
      .replace(/\{\{TICKET\}\}/g, ticket || 'No ticket found')
      .replace(/\{\{COMMITS\}\}/g, commitSummary)
      .replace(/\{\{DIFF\}\}/g, diff || 'No diff available')
      .replace(/\{\{QA_SECTION\}\}/g, qaSection)

    // 9. Call AI with spinner
    const spinner = startSpinner(`Generating PR content via ${provider}...`)
    let response
    try {
      response = await launch(prompt, { temperature: 0.3 })
    } finally {
      stopSpinner(spinner)
    }
    let prContent = parsePrContent(response.content)

    // 10. Open editor (unless --no-edit or --dry-run)
    if (!noEdit && !dryRun) {
      const tmpFile = `/tmp/qk-pr-${Date.now()}.md`
      const editorContent = [
        '# PR Title',
        prContent.title,
        '',
        '# PR Description',
        prContent.description,
      ].join('\n')

      writeFileSync(tmpFile, editorContent, 'utf-8')

      const editor = process.env.EDITOR || 'vim'
      spawnSync(editor, [tmpFile], { stdio: 'inherit' })

      const edited = readFileSync(tmpFile, 'utf-8')
      unlinkSync(tmpFile)

      const parsedEdit = parseEditorContent(edited)
      if (!parsedEdit.title.trim()) {
        console.log('PR title is empty, cancelled.')
        process.exit(0)
      }
      prContent = parsedEdit
    }

    // 11. Preview
    console.log('\n' + '='.repeat(50))
    console.log('PR Preview:')
    console.log('='.repeat(50))
    console.log(`Title: ${prContent.title}`)
    console.log(`\nDescription:\n${prContent.description}`)
    console.log('='.repeat(50))

    if (dryRun) {
      console.log('\n--dry-run: preview only, no PR created.')
      process.exit(0)
    }

    // 12. Check gh CLI
    if (!(await hasGhCli())) {
      console.log('\nGitHub CLI (gh) not found. Install from https://cli.github.com/')
      console.log(`Branch: ${currentBranch} → ${mainBranch}`)
      process.exit(0)
    }

    // 13. Confirm
    const ok = await confirm({ message: 'Create Pull Request?', default: true })
    if (!ok) {
      console.log('Cancelled.')
      process.exit(0)
    }

    // 14. Push branch if needed
    // First check if remote branch exists, not just local upstream config
    let remoteBranchExists = await hasRemoteTracking()
    if (remoteBranchExists) {
      // Verify remote branch actually exists
      try {
        await $`git ls-remote --heads origin ${currentBranch}`
      } catch {
        remoteBranchExists = false
      }
    }
    
    if (!remoteBranchExists) {
      console.log('Branch not found on remote. Pushing branch...')
      const pushed = await pushBranch()
      if (!pushed) {
        console.error('Failed to push branch.')
        process.exit(1)
      }
      console.log('Branch pushed.')
    }

    // 15. Create PR
    console.log('Creating Pull Request...')
    const result = await $`gh pr create --title ${prContent.title} --body ${prContent.description} --head ${currentBranch}`
    console.log('Pull Request created!')
    console.log(`PR URL: ${result.stdout.trim()}`)

  } catch (error) {
    if (error.name === 'ExitPromptError') {
      console.log('\nCancelled.')
      process.exit(0)
    }
    console.error(`Error: ${error.message}`)
    process.exit(1)
  }
}

/**
 * Parse AI response to extract title and description
 * @param {string} raw
 * @returns {{title: string, description: string}}
 */
function parsePrContent(raw) {
  const lines = raw.trim().split('\n')
  let title = ''
  const descLines = []
  let titleFound = false

  for (const line of lines) {
    if (!titleFound && line.trim().toLowerCase().startsWith('title:')) {
      title = line.trim().slice(6).trim()
      titleFound = true
      continue
    }
    if (titleFound) {
      // Skip leading blank lines after title
      if (!descLines.length && !line.trim()) continue
      // Skip "description:" prefix line if present
      if (!descLines.length && line.trim().toLowerCase().startsWith('description:')) {
        const rest = line.trim().slice(12).trim()
        if (rest) descLines.push(rest)
        continue
      }
      descLines.push(line)
    }
  }

  return {
    title: title || 'Update: codebase changes',
    description: descLines.join('\n').trim(),
  }
}

/**
 * Parse editor temp file content (# PR Title / # PR Description sections)
 * @param {string} content
 * @returns {{title: string, description: string}}
 */
function parseEditorContent(content) {
  const lines = content.split('\n')
  let section = null
  const titleLines = []
  const descLines = []

  for (const line of lines) {
    if (line.trim() === '# PR Title') { section = 'title'; continue }
    if (line.trim() === '# PR Description') { section = 'description'; continue }

    if (section === 'title' && line.trim()) {
      titleLines.push(line.trim())
      section = null // only first non-empty line
    } else if (section === 'description') {
      descLines.push(line)
    }
  }

  return {
    title: titleLines.join(' '),
    description: descLines.join('\n').trim(),
  }
}

export default run
