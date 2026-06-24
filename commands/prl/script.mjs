#!/usr/bin/env bun

import { spawnSync } from 'child_process'
import { $ } from 'zx'
import chalk from 'chalk'
import * as p from '@clack/prompts'
import {
  isGitRepo,
  getCurrentBranch,
  hasGhCli,
} from '../../lib/git/index.mjs'

$.verbose = false

/**
 * 根据平台返回打开默认浏览器的命令。
 * @returns {string}
 */
function openCommand() {
  const platform = process.platform
  if (platform === 'darwin') return 'open'
  if (platform === 'win32') return 'start ""'
  return 'xdg-open' // linux / 其他 unix
}

/**
 * 查询当前分支是否已有 PR，返回其 url（无则 null）。
 * @param {string} branch
 * @returns {Promise<string|null>}
 */
function getPRUrl(branch) {
  // 用 spawnSync 静默执行，避免 gh 无 PR 时把 stderr 写入终端
  const res = spawnSync('gh', ['pr', 'view', branch, '--json', 'url', '--jq', '.url'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (res.status !== 0) return null
  const url = res.stdout.trim()
  return url || null
}

/**
 * @description Open current branch's Pull Request in default browser (or notify if none exists)
 */
export async function run(args) {
  p.intro(chalk.bgCyan.black(' QK · PRL '))

  try {
    if (!(await isGitRepo())) {
      p.cancel('Not a git repository.')
      process.exit(1)
    }

    if (!(await hasGhCli())) {
      p.cancel('GitHub CLI (gh) not found. Install from https://cli.github.com/')
      process.exit(1)
    }

    const branch = await getCurrentBranch()

    const spinner = p.spinner()
    spinner.start(`Checking PR for branch '${branch}'...`)
    const prUrl = getPRUrl(branch)
    spinner.stop('Done.')

    if (!prUrl) {
      p.note(
        `Branch ${chalk.cyan(branch)} has no open Pull Request.\nRun ${chalk.green('qk gpr')} to create one.`,
        'No PR found'
      )
      p.outro(chalk.yellow('Nothing to open.'))
      process.exit(0)
    }

    // 用默认浏览器打开
    const opener = openCommand()
    if (process.platform === 'win32') {
      // start 需经 cmd /c
      await $`cmd /c ${opener} ${prUrl}`
    } else {
      await $`${opener} ${prUrl}`
    }

    p.outro(`${chalk.green('✓ Opened PR')} ${chalk.cyan.underline(prUrl)}`)
  } catch (error) {
    p.cancel(`Error: ${error.message}`)
    process.exit(1)
  }
}

export default run
