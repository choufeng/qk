#!/usr/bin/env bun

import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'
import { $ } from 'zx'
import chalk from 'chalk'
import { confirm, select, checkbox } from '@inquirer/prompts'
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
  remoteBranchExists,
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
 * Check if package version was upgraded in current branch
 * @returns {{upgraded: boolean, oldVersion: string|null, newVersion: string|null}}
 */
async function checkVersionUpgrade() {
  try {
    const mainBranch = await getMainBranch()
    
    let mainVersion = null
    let currentVersion = null
    
    try {
      const mainPkg = await $`git show ${mainBranch}:package.json`
      const mainPkgJson = JSON.parse(mainPkg.stdout.trim())
      mainVersion = mainPkgJson.version
    } catch {
      return { upgraded: false, oldVersion: null, newVersion: null }
    }
    
    try {
      const currentPkg = await $`git show HEAD:package.json`
      const currentPkgJson = JSON.parse(currentPkg.stdout.trim())
      currentVersion = currentPkgJson.version
    } catch {
      return { upgraded: false, oldVersion: null, newVersion: null }
    }
    
    if (mainVersion && currentVersion && mainVersion !== currentVersion) {
      return {
        upgraded: true,
        oldVersion: mainVersion,
        newVersion: currentVersion
      }
    }
    
    return { upgraded: false, oldVersion: null, newVersion: null }
  } catch {
    return { upgraded: false, oldVersion: null, newVersion: null }
  }
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
    console.log(chalk.cyan(`Analyzing branch '${currentBranch}'...`))
    const commits = await getBranchCommits()
    const diff = await getBranchDiff()

    if (commits.length === 0 && !diff.trim()) {
      console.log(chalk.yellow('No changes found vs main branch. Nothing to PR.'))
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
    const autoPR = config.get('git.autoPR')
    const prompt = template
      .replace(/\{\{LANGUAGE\}\}/g, language)
      .replace(/\{\{TICKET\}\}/g, ticket || 'No ticket found')
      .replace(/\{\{COMMITS\}\}/g, commitSummary)
      .replace(/\{\{DIFF\}\}/g, diff || 'No diff available')
      .replace(/\{\{QA_SECTION\}\}/g, qaSection)

    // 9. Push branch first (needed to check if PR exists)
    let shouldPush = !(await remoteBranchExists(currentBranch))
    if (!shouldPush) {
      console.log(chalk.yellow('Branch already exists on remote, ensuring up-to-date...'))
    } else {
      console.log(chalk.cyan('Pushing branch to remote...'))
    }

    const pushed = await pushBranch()
    if (!pushed) {
      console.error(chalk.red('Failed to push branch.'))
      process.exit(1)
    }
    console.log(shouldPush ? chalk.green('Branch pushed.') : chalk.green('Branch updated.'))

    // 10. Check if PR already exists
    let prUrl = null
    let prExists = false
    try {
      const existing = await $`gh pr view ${currentBranch} --json url --jq .url`
      prUrl = existing.stdout.trim()
      prExists = true
    } catch {
      // No existing PR
    }

    // 11. If PR exists, skip AI generation and just update the PR
    let prContent
    if (prExists) {
      console.log(chalk.yellow('Pull Request already exists, skipping AI generation.'))
      // Get existing PR info to reuse title and description
      try {
        const prInfo = await $`gh pr view ${currentBranch} --json title,body --jq '.title, .body'`
        const [title, ...bodyLines] = prInfo.stdout.trim().split('\n')
        prContent = {
          title: title.trim(),
          description: bodyLines.join('\n').trim()
        }
      } catch {
        prContent = { title: 'Update: codebase changes', description: '' }
      }
    } else {
      // 12. Call AI with spinner (only for new PR)
      const spinner = startSpinner(chalk.cyan(`Generating PR content via ${provider}...`))
      let response
      try {
        response = await launch(prompt, { temperature: 0.3 })
      } finally {
        stopSpinner(spinner)
      }
      prContent = parsePrContent(response.content)
    }

    // 12.1 E2E tag selection (only for new PRs)
    const e2eTags = config.get('git.e2eTags') || []
    if (e2eTags.length > 0 && !prExists && autoPR !== true && !dryRun) {
      const selectedTags = await checkbox({
        message: 'Select E2E tags for this PR (optional):',
        choices: e2eTags.map(tag => ({ name: tag, value: tag })),
      })

      if (selectedTags.length > 0) {
        const e2eLine = `[E2E: ${selectedTags.join(', ')}]`
        if (prContent.description) {
          prContent.description = prContent.description.trimEnd() + '\n\n' + e2eLine
        } else {
          prContent.description = e2eLine
        }
      }
    }

    // 12.2 Label selection (only for new PRs)
    const prLabels = config.get('git.prLabels') || []
    let selectedLabels = []
    if (prLabels.length > 0 && !prExists && autoPR !== true && !dryRun) {
      let remoteLabels = []
      try {
        const labelResult = await $`gh label list --json name --jq '.[].name'`
        remoteLabels = labelResult.stdout.trim().split('\n').filter(Boolean)
      } catch {
        // Silently skip if gh label list fails
      }

      const availableLabels = remoteLabels.filter(name => prLabels.includes(name))

      if (availableLabels.length > 0) {
        selectedLabels = await checkbox({
          message: 'Select labels for this PR (optional):',
          choices: availableLabels.map(tag => ({ name: tag, value: tag })),
        })
      }
    }

    // 12.3 Open editor (unless --no-edit, --dry-run, autoPR, or PR already exists)
    if (!noEdit && !dryRun && autoPR !== true && !prExists) {
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
    console.log('\n' + chalk.gray('─').repeat(50))
    console.log(chalk.bold.cyan('📋 PR Preview:'))
    console.log(chalk.gray('─').repeat(50))
    console.log(chalk.bold('Title:') + ' ' + chalk.green(prContent.title))
    console.log(chalk.bold('\nDescription:'))
    console.log(chalk.white(prContent.description))
    console.log(chalk.gray('─').repeat(50))

    if (dryRun) {
      console.log(chalk.yellow('\n--dry-run: preview only, no PR created.'))
      process.exit(0)
    }

    // 12. Check gh CLI
    if (!(await hasGhCli())) {
      console.log(chalk.red('\nGitHub CLI (gh) not found. Install from https://cli.github.com/'))
      console.log(chalk.gray(`Branch: ${currentBranch} → ${mainBranch}`))
      process.exit(0)
    }

    // 12.5 Ask PR type (always ask for new PR)
    let isDraft = false
    if (!prExists) {
      const prType = await select({
        message: 'Create a draft or ready PR?',
        choices: [
          { name: 'Draft PR', value: 'draft' },
          { name: 'Ready PR', value: 'ready' },
        ],
      })
      
      isDraft = prType === 'draft'
      console.log(chalk.gray(`→ PR Type: ${isDraft ? 'Draft' : 'Ready'}`))
    }

    // 13. Confirm (skip if autoPR is true or PR already exists)
    if (autoPR !== true && !prExists) {
      const ok = await confirm({ message: 'Create Pull Request?', default: true })
      if (!ok) {
        console.log(chalk.yellow('Cancelled.'))
        process.exit(0)
      }
    }

    // 14. Create or update PR
    const bodyFile = `/tmp/qk-pr-body-${Date.now()}.md`
    writeFileSync(bodyFile, prContent.description, 'utf-8')

    if (prExists) {
      console.log(chalk.cyan('Updating existing Pull Request...'))
      await $`gh pr edit ${currentBranch} --title ${prContent.title} --body-file ${bodyFile}`
      console.log(chalk.green('✓ Pull Request updated!'))
    } else {
      console.log(chalk.cyan('Creating Pull Request...'))
      const labelArgs = selectedLabels.flatMap(l => ['--label', l])
      const createCmd = isDraft
        ? $`gh pr create --title ${prContent.title} --body-file ${bodyFile} --head ${currentBranch} --draft ${labelArgs}`
        : $`gh pr create --title ${prContent.title} --body-file ${bodyFile} --head ${currentBranch} ${labelArgs}`
      const result = await createCmd
      prUrl = result.stdout.trim()
      console.log(chalk.green('✓ Pull Request created!'))
    }

    try { unlinkSync(bodyFile) } catch {}
    console.log(chalk.bold.blue(`🔗 PR URL: ${prUrl}`))

  } catch (error) {
    if (error.name === 'ExitPromptError') {
      console.log(chalk.yellow('\nCancelled.'))
      process.exit(0)
    }
    console.error(chalk.red(`Error: ${error.message}`))
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
