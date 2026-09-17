#!/usr/bin/env bun

import { rmSync, existsSync } from 'fs'
import { spawnSync } from 'child_process'
import { $ } from 'zx'
import chalk from 'chalk'
import * as p from '@clack/prompts'
import { isGitRepo } from '../../lib/git/index.mjs'

$.verbose = false

/** 锁文件 → 重新生成命令映射 */
const LOCKFILES = {
  'pnpm-lock.yaml': 'pnpm install',
  'bun.lock': 'bun install',
  'bun.lockb': 'bun install',
  'package-lock.json': 'npm install',
  'yarn.lock': 'yarn install',
  'deno.lock': 'deno install',
}

const isLockfile = (f) => f in LOCKFILES

/**
 * @description 智能预检冲突的 rebase：锁文件冲突自动重装解决，源码冲突交人
 */
export async function run(args) {
  p.intro(chalk.bgCyan.black(' QK · Rebase '))

  try {
    // ── 0. 前置检查 ──────────────────────────────────────────
    if (!(await isGitRepo())) {
      p.cancel('Not a git repository.')
      process.exit(1)
    }

    const branch = (await $`git branch --show-current`).stdout.trim()
    if (!branch) {
      p.cancel('Detached HEAD, nothing to rebase.')
      process.exit(1)
    }

    // ── 1. 解析目标分支（默认探测主分支）────────────────────
    let target = args.flat().filter((a) => typeof a === 'string')[0]

    if (!target) {
      target = await detectMainBranch()
      if (!target) {
        p.cancel('无法探测主分支（origin/HEAD、origin/main、origin/master、main、master 均不存在），请显式指定：qk rebase <branch>')
        process.exit(1)
      }
    }

    if (target === branch || target === `origin/${branch}`) {
      p.cancel(`当前分支就是 ${branch}，无需 rebase。`)
      process.exit(0)
    }

    // fetch 远端，保持目标最新（无远程/离线则跳过，用本地）
    const spinner = p.spinner()
    spinner.start(`git fetch origin ${target}...`)
    await $`git fetch origin ${target}`.nothrow().quiet()
    spinner.stop('fetch 完成')

    // 优先 rebase 到远端追踪分支
    const remoteRef = `origin/${target}`
    let rebaseRef = target
    try {
      await $`git rev-parse --verify -q ${remoteRef}`
      rebaseRef = remoteRef
    } catch {
      /* 无远程追踪，用本地分支 */
    }

    try {
      await $`git rev-parse --verify -q ${rebaseRef}`
    } catch {
      p.cancel(`分支不存在: ${rebaseRef}`)
      process.exit(1)
    }

    p.log.info(`${chalk.cyan(branch)} → rebase onto ${chalk.cyan(rebaseRef)}`)

    // ── 2. merge-tree 预检冲突（dry-run，不动工作区）────────
    const preview = await previewConflicts(rebaseRef)

    if (preview === null) {
      p.log.warn('Git < 2.38 无 merge-tree，跳过预检，直接 rebase（自动处理仍兜底）')
    } else if (preview.length === 0) {
      p.log.success('预检无冲突，直接 rebase')
    } else {
      const locks = preview.filter(isLockfile)
      const others = preview.filter((f) => !isLockfile(f))
      if (others.length === 0) {
        p.log.info(`预检冲突 ${preview.length} 个文件，全部为锁文件 → 自动重装解决:`)
        p.note(locks.map((f) => `${chalk.yellow('↻')} ${f}`).join('\n'))
      } else {
        p.log.warn(`预检有源码冲突，rebase 将停在冲突处交你解决:`)
        p.note(
          preview
            .map((f) => `${isLockfile(f) ? chalk.yellow('↻ 锁文件（自动）') : chalk.red('✎ 源码（手动）')} ${f}`)
            .join('\n')
        )
      }
    }

    // ── 3. rebase + 冲突分类处理 ────────────────────────────
    await $`git rebase --autostash ${rebaseRef}`.nothrow().quiet()

    while (await inRebase()) {
      const conflicted = (await $`git diff --name-only --diff-filter=U`).stdout
        .trim()
        .split('\n')
        .filter(Boolean)

      if (conflicted.length === 0) {
        // 停顿但无未合并文件（已全部解决）→ continue；continue 失败则 skip
        const c = await $`GIT_EDITOR=true git rebase --continue`.nothrow().quiet()
        if (c.exitCode !== 0) await $`GIT_EDITOR=true git rebase --skip`.nothrow().quiet()
        continue
      }

      const others = conflicted.filter((f) => !isLockfile(f))

      if (others.length > 0) {
        await handOverToHuman(conflicted)
        // 交互后重读状态：源码已解决且剩锁文件 → 回循环自动处理；未解决 → 退出交人
        const after = (await $`git diff --name-only --diff-filter=U`).stdout
          .trim()
          .split('\n')
          .filter(Boolean)
        if (after.some((f) => !isLockfile(f))) {
          p.log.info('请解决剩余源码冲突后 git add + git rebase --continue（放弃: git rebase --abort）')
          return
        }
        continue
      }

      // 全锁文件冲突：删掉重装，重新生成
      for (const lock of conflicted) {
        p.log.step(`${chalk.yellow('↻')} 重新生成 ${lock} (${LOCKFILES[lock]})`)
        rmSync(lock, { force: true })
      }
      const installCmd = LOCKFILES[conflicted.find(isLockfile)]
      const res = await $`${installCmd.split(' ')}`.nothrow()
      if (res.exitCode !== 0) {
        await handOverToHuman(conflicted)
        p.log.error('依赖安装失败，请手动处理后 git rebase --continue')
        return
      }
      await $`git add ${conflicted}`
      await $`GIT_EDITOR=true git rebase --continue`.nothrow().quiet()
    }

    const newHead = (await $`git rev-parse --short HEAD`).stdout.trim()
    p.outro(chalk.green(`✔ rebase 完成 @ ${newHead}`))
  } catch (err) {
    p.cancel(`rebase 失败: ${err.message}`)
    console.error(err.stderr?.toString() || err.message)
    process.exit(1)
  }
}

/** 探测主分支：origin/HEAD → origin/main → origin/master → 本地 main → master */
async function detectMainBranch() {
  try {
    const head = (await $`git symbolic-ref -q --short refs/remotes/origin/HEAD`).stdout.trim()
    if (head) return head.replace(/^origin\//, '')
  } catch { /* ignore */ }
  for (const cand of ['origin/main', 'origin/master', 'main', 'master']) {
    try {
      await $`git rev-parse --verify -q ${cand}`
      return cand.replace(/^origin\//, '')
    } catch { /* next */ }
  }
  return null
}

/** merge-tree dry-run 预检，返回冲突文件列表；null = Git 版本不支持 */
async function previewConflicts(ref) {
  const gitVersion = (await $`git version`).stdout
  const m = gitVersion.match(/(\d+)\.(\d+)/)
  if (m && (Number(m[1]) < 2 || (Number(m[1]) === 2 && Number(m[2]) < 38))) return null

  const res = await $`git merge-tree --write-tree --name-only HEAD ${ref}`.nothrow().quiet()
  if (res.exitCode === 0) return []
  if (res.exitCode === 1) {
    // 输出: tree OID + 冲突文件名列表 + 空行 + Auto-merging 等信息行，只取空行前段
    return res.stdout.split('\n\n')[0].trim().split('\n').slice(1).filter(Boolean)
  }
  throw new Error(`merge-tree 执行失败: ${res.stderr}`)
}

/** rebase 是否进行中（merge 或 apply 后端） */
async function inRebase() {
  const gitDir = (await $`git rev-parse --git-path rebase-merge`).stdout.trim()
  const gitDirApply = (await $`git rev-parse --git-path rebase-apply`).stdout.trim()
  return existsSync(gitDir) || existsSync(gitDirApply)
}

/** 源码冲突：列文件 + 打开 lazygit（若有），交人解决 */
async function handOverToHuman(conflicted) {
  const locks = conflicted.filter(isLockfile)
  p.log.warn(`源码冲突 ${conflicted.length - locks.length} 个文件，需要手动解决:`)
  p.note(
    conflicted
      .map((f) => `${isLockfile(f) ? chalk.yellow('↻ 锁文件（可 rm + 重装）') : chalk.red('✎ 手动解决')} ${f}`)
      .join('\n')
  )
  if (commandExists('lazygit')) {
    p.log.info('启动 lazygit，解决冲突后 add + rebase --continue')
    spawnSync('lazygit', [], { stdio: 'inherit' })
  } else {
    p.log.info('解决后: git add <files> && git rebase --continue ｜ 放弃: git rebase --abort')
  }
}

function commandExists(cmd) {
  try {
    spawnSync(cmd, ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export default run
