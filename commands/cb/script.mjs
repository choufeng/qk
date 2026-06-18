#!/usr/bin/env bun

import { spawnSync } from 'child_process'
import { $ } from 'zx'
import chalk from 'chalk'
import * as p from '@clack/prompts'
import { getCurrentBranch } from '../../lib/git/index.mjs'

$.verbose = false

/**
 * 从 reflog checkout 记录提取最近操作过的分支，按时间倒序去重。
 * @clack select 内置 vim 风格键映射：k=上、j=下，同时支持方向键。
 * @param {string} current - 当前分支名（排除自身）
 * @returns {Promise<string[]>}
 */
async function getRecentBranches(current) {
  try {
    const result = await $`git reflog --format=%gs`
    const lines = result.stdout.trim().split('\n').filter(Boolean)
    const recent = []
    // reflog 默认最新在前；同一记录里 to 比 from 更近
    for (const line of lines) {
      const m = line.match(/moving from (.+) to (.+)/)
      if (!m) continue
      const [, from, to] = m
      for (const b of [to, from]) {
        if (b && b !== current && !recent.includes(b)) recent.push(b)
      }
    }
    return recent
  } catch {
    return []
  }
}

/**
 * 本地分支兜底补充（按最近提交时间倒序）。
 * @param {string} current
 * @returns {Promise<string[]>}
 */
async function getLocalBranches(current) {
  try {
    const fmtArg = '--format=%(refname:short)'
    const result = await $`git for-each-ref --sort=-committerdate ${fmtArg} refs/heads/`
    return result.stdout.trim().split('\n').filter(b => b && b !== current)
  } catch {
    return []
  }
}

/**
 * 确认是否在 git 仓库内
 * @returns {Promise<boolean>}
 */
async function isGitRepo() {
  try {
    await $`git rev-parse --is-inside-work-tree`
    return true
  } catch {
    return false
  }
}

/**
 * @description Switch git branch interactively (type to filter, arrow keys to pick, Enter to switch)
 */
export async function run(args) {
  p.intro(chalk.bgCyan.black(' QK · CB '))

  if (!(await isGitRepo())) {
    p.cancel('Not a git repository.')
    process.exit(1)
  }

  const current = await getCurrentBranch()

  const [recent, local] = await Promise.all([
    getRecentBranches(current),
    getLocalBranches(current),
  ])

  // reflog 优先，再用本地分支补充，去重
  const merged = [...recent]
  for (const b of local) {
    if (!merged.includes(b)) merged.push(b)
  }

  if (merged.length === 0) {
    p.cancel('No other branches to switch to.')
    process.exit(0)
  }

  const recentSet = new Set(recent)
  const options = merged.map(b => ({
    label: b,
    value: b,
    hint: recentSet.has(b) ? 'recent' : 'local',
  }))

  const selected = await p.autocomplete({
    message: `Switch branch ${chalk.dim(`(current: ${current})`)}`,
    options,
    initialValue: merged[0],
    placeholder: 'Type to filter…',
  })

  if (p.isCancel(selected)) {
    p.cancel('Cancelled.')
    process.exit(0)
  }

  // 尝试切换；失败则展示 git 报错且不切换
  // spawnSync + stdin ignore：避免外层 TTY / 残留输入污染 git 交互
  const res = spawnSync('git', ['checkout', selected], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf-8',
  })
  if (res.status === 0) {
    p.outro(chalk.green(`✓ Switched to ${selected}`))
    if (res.stdout?.trim()) console.log(res.stdout.trim())
  } else {
    const msg = (res.stderr || res.stdout || '').trim()
    p.note(msg || '(no details)', chalk.red(`Switch failed: ${selected}`))
    p.outro(chalk.red('Branch not switched.'))
    process.exit(1)
  }
}

export default run
