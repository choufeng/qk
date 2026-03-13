#!/usr/bin/env bun

import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'
import { $ } from 'zx'
import { confirm } from '@inquirer/prompts'
import { launch } from '../../lib/ai/index.mjs'
import { ConfigManager } from '../../lib/config/index.mjs'
import { hasStagedChanges, getStagedDiff } from '../../lib/git/index.mjs'
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
 * @description AI-powered commit message generator
 */
export async function run(args) {
  try {
    // 1. Check staged changes
    const hasChanges = await hasStagedChanges()
    if (!hasChanges) {
      console.log('No staged changes found. Run git add first.')
      process.exit(0)
    }

    // 2. Load prompt template
    const templatePath = join(PROMPTS_DIR, 'commit.md')
    let template
    try {
      template = readFileSync(templatePath, 'utf-8')
    } catch {
      console.error(`Error: prompt template not found at ${templatePath}`)
      process.exit(1)
    }

    // 3. Get staged diff
    const diff = await getStagedDiff()
    if (!diff.trim()) {
      console.log('No changes to analyze.')
      process.exit(0)
    }

    // 4. Inject placeholders
    const config = new ConfigManager()
    const language = config.get('ai.language') || 'en'
    const provider = config.get('ai.provider')
    const prompt = template
      .replace(/\{\{LANGUAGE\}\}/g, language)
      .replace(/\{\{DIFF\}\}/g, diff)

    // 5. Call AI with spinner
    const spinner = startSpinner(`Generating commit message via ${provider}...`)
    let response
    try {
      response = await launch(prompt, { temperature: 0.3 })
    } finally {
      stopSpinner(spinner)
    }
    const rawMessage = response.content

    // 6. Parse AI response into commit message
    const commitMessage = parseCommitMessage(rawMessage)

    // 7. Write to temp file and open editor
    const tmpFile = `/tmp/qk-commit-${Date.now()}.txt`
    const editorContent = [
      commitMessage,
      '',
      '# Please edit your commit message above.',
      '# Lines starting with # will be ignored.',
      '# Save and exit to proceed. Empty message cancels the commit.',
    ].join('\n')

    writeFileSync(tmpFile, editorContent, 'utf-8')

    const editor = process.env.EDITOR || 'vim'
    spawnSync(editor, [tmpFile], { stdio: 'inherit' })

    // 8. Read and clean edited content
    const edited = readFileSync(tmpFile, 'utf-8')
    const finalMessage = edited
      .split('\n')
      .filter(line => !line.startsWith('#'))
      .join('\n')
      .trim()

    unlinkSync(tmpFile)

    if (!finalMessage) {
      console.log('Empty commit message, commit cancelled.')
      process.exit(0)
    }

    // 9. Preview and confirm
    console.log('\nCommit message:')
    console.log('─'.repeat(50))
    console.log(finalMessage)
    console.log('─'.repeat(50))

    const ok = await confirm({ message: 'Commit with this message?', default: true })
    if (!ok) {
      console.log('Cancelled.')
      process.exit(0)
    }

    // 10. Execute commit
    await $`git commit -m ${finalMessage}`
    console.log('Changes committed successfully!')

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
 * Parse AI response into a formatted commit message
 * Expected format: "type: subject\nbody: ..."
 * @param {string} raw
 * @returns {string}
 */
function parseCommitMessage(raw) {
  const lines = raw.trim().split('\n').map(l => l.trim()).filter(Boolean)
  let type = 'chore'
  let subject = 'update'
  const bodyLines = []
  let inBody = false

  for (const line of lines) {
    if (line.toLowerCase().startsWith('type:') && !inBody) {
      type = line.slice(5).trim()
    } else if (line.toLowerCase().startsWith('subject:') && !inBody) {
      subject = line.slice(8).trim()
    } else if (line.toLowerCase().startsWith('body:')) {
      inBody = true
      const rest = line.slice(5).trim()
      if (rest) bodyLines.push(rest)
    } else if (inBody) {
      bodyLines.push(line)
    }
  }

  const header = `${type}: ${subject}`
  if (bodyLines.length === 0) return header
  return `${header}\n\n${bodyLines.join('\n')}`
}

export default run
