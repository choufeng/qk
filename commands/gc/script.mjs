#!/usr/bin/env bun

import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { spawnSync } from 'child_process'
import { $ } from 'zx'
import chalk from 'chalk'
import * as p from '@clack/prompts'
import { launch } from '../../lib/ai/index.mjs'
import { ConfigManager } from '../../lib/config/index.mjs'
import { hasStagedChanges, getStagedDiff, getModifiedFiles } from '../../lib/git/index.mjs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

$.verbose = false

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPTS_DIR = join(__dirname, '../../configs/prompts')

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
  p.intro(chalk.bgCyan.black(' QK · GC '))

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
      const modifiedFiles = await getModifiedFiles()

      if (modifiedFiles.length === 0) {
        p.cancel('No staged changes and no modified files found.')
        process.exit(0)
      }

      const selected = await p.multiselect({
        message: 'No staged changes. Choose files to stage:',
        options: modifiedFiles.map(({ absolute, display }) => ({ label: display, value: absolute })),
        required: true,
      })
      if (p.isCancel(selected)) { p.cancel('Cancelled.'); process.exit(0) }

      await $`git add ${selected}`
      p.log.success(`Staged ${selected.length} file(s).`)
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
    const aiSpinner = p.spinner()
    aiSpinner.start(`Generating commit message via ${provider}...`)
    let response
    try {
      response = await launch(prompt, { temperature: 0.3 })
      aiSpinner.stop('Commit message generated.')
    } catch (err) {
      aiSpinner.stop('AI generation failed.', 1)
      throw err
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
        p.cancel('Empty commit message, commit cancelled.')
        process.exit(0)
      }

      // 9. Preview and confirm
      p.note(finalMessage, 'Commit message')

      const ok = await p.confirm({ message: 'Commit with this message?', initialValue: true })
      if (p.isCancel(ok) || !ok) {
        p.cancel('Cancelled.')
        process.exit(0)
      }
    }

    // 10. Execute commit
    await $`git commit -m ${finalMessage}`
    p.outro(chalk.green('Changes committed successfully.'))

  } catch (error) {
    p.cancel(`Error: ${error.message}`)
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
