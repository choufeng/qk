#!/usr/bin/env bun

import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'
import { $ } from 'zx'
import chalk from 'chalk'
import { confirm, checkbox } from '@inquirer/prompts'
import { launch } from '../../lib/ai/index.mjs'
import { ConfigManager } from '../../lib/config/index.mjs'
import { hasStagedChanges, getStagedDiff, getModifiedFiles } from '../../lib/git/index.mjs'
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
 * Check if a command exists in PATH
 * @param {string} cmd
 * @returns {boolean}
 */
function commandExists(cmd) {
  try {
    spawnSync(cmd, ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * @description AI-powered commit message generator
 */
export async function run(args) {
  try {
    // 0. Check for lazygit and config, open it if available
    const config = new ConfigManager()
    const hasLazygit = commandExists('lazygit')
    const useLazygit = config.get('git.useLazygit')
    if (hasLazygit && useLazygit === true) {
      spawnSync('lazygit', [], { stdio: 'inherit' })
    }

    // 1. Check staged changes
    const hasChanges = await hasStagedChanges()
    if (!hasChanges) {
      // No staged changes, offer to select from modified files
      const modifiedFiles = await getModifiedFiles()
      
      if (modifiedFiles.length === 0) {
        console.log(chalk.yellow('No staged changes and no modified files found.'))
        process.exit(0)
      }

      console.log(chalk.cyan('\nNo staged changes found. Select files to add:\n'))

      const selected = await checkbox({
        message: 'Choose files to stage:',
        choices: modifiedFiles.map(({ absolute, display }) => ({ name: display, value: absolute })),
      })

      if (!selected || selected.length === 0) {
        console.log(chalk.yellow('No files selected, cancelled.'))
        process.exit(0)
      }

      // Add selected files using absolute paths to avoid cwd-relative path issues
      const filesToAdd = Array.isArray(selected) ? selected : [selected]
      await $`git add ${filesToAdd}`
      console.log(chalk.green(`\nStaged ${filesToAdd.length} file(s).\n`))
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
      console.log(chalk.yellow('No changes to analyze.'))
      process.exit(0)
    }

    // 4. Inject placeholders
    const language = config.get('ai.language') || 'en'
    const provider = config.get('ai.provider')
    const prompt = template
      .replace(/\{\{LANGUAGE\}\}/g, language)
      .replace(/\{\{DIFF\}\}/g, diff)

    // 5. Call AI with spinner
    const spinner = startSpinner(chalk.cyan(`Generating commit message via ${provider}...`))
    let response
    try {
      response = await launch(prompt, { temperature: 0.3 })
    } finally {
      stopSpinner(spinner)
    }
    const rawMessage = response.content

    // 6. Parse AI response into commit message
    const commitMessage = parseCommitMessage(rawMessage)

    // 6.5 Check autoCommit config
    const autoCommit = config.get('git.autoCommit')

    let finalMessage = commitMessage
    if (autoCommit !== true) {
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
      finalMessage = edited
        .split('\n')
        .filter(line => !line.startsWith('#'))
        .join('\n')
        .trim()

      unlinkSync(tmpFile)

      if (!finalMessage) {
        console.log(chalk.yellow('Empty commit message, commit cancelled.'))
        process.exit(0)
      }

      // 9. Preview and confirm
      console.log(chalk.cyan('\nCommit message:'))
      console.log(chalk.gray('─'.repeat(50)))
      console.log(chalk.white(finalMessage))
      console.log(chalk.gray('─'.repeat(50)))

      const ok = await confirm({ message: 'Commit with this message?', default: true })
      if (!ok) {
        console.log(chalk.yellow('Cancelled.'))
        process.exit(0)
      }
    }

    // 10. Execute commit
    await $`git commit -m ${finalMessage}`
    console.log(chalk.green('✓ Changes committed successfully!'))

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
