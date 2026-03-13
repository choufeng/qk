#!/usr/bin/env bun

import { $ } from 'zx'

// Silence ZX verbose output
$.verbose = false

/**
 * Check if current directory is inside a git repository
 * @returns {Promise<boolean>}
 */
export async function isGitRepo() {
  try {
    await $`git rev-parse --is-inside-work-tree`
    return true
  } catch {
    return false
  }
}

/**
 * Check if there are staged changes
 * @returns {Promise<boolean>}
 */
export async function hasStagedChanges() {
  const result = await $`git diff --cached --name-only`
  return result.stdout.trim().length > 0
}

/**
 * Get the full diff of staged changes
 * @returns {Promise<string>}
 */
export async function getStagedDiff() {
  const result = await $`git diff --cached`
  return result.stdout
}

/**
 * Get the current branch name
 * @returns {Promise<string>}
 */
export async function getCurrentBranch() {
  const result = await $`git branch --show-current`
  return result.stdout.trim()
}

/**
 * Detect the main branch name (main, master, or develop)
 * @returns {Promise<string>}
 */
export async function getMainBranch() {
  // Strategy 1: remote HEAD
  try {
    const result = await $`git symbolic-ref refs/remotes/origin/HEAD`
    const branch = result.stdout.trim().split('/').pop()
    if (branch) return branch
  } catch {
    // fall through
  }

  // Strategy 2: check common names
  for (const name of ['main', 'master', 'develop']) {
    try {
      await $`git show-ref --verify --quiet refs/heads/${name}`
      return name
    } catch {
      try {
        await $`git show-ref --verify --quiet refs/remotes/origin/${name}`
        return name
      } catch {
        // try next
      }
    }
  }

  // Fallback
  return 'main'
}

/**
 * Get commits in current branch not in main branch
 * @returns {Promise<Array<{hash: string, message: string}>>}
 */
export async function getBranchCommits() {
  const mainBranch = await getMainBranch()
  try {
    const result = await $`git log ${mainBranch}..HEAD --format=${'%h %s'}`
    return result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [hash, ...rest] = line.split(' ')
        return { hash, message: rest.join(' ') }
      })
  } catch {
    return []
  }
}

/**
 * Get diff between current branch and main branch
 * @returns {Promise<string>}
 */
export async function getBranchDiff() {
  const mainBranch = await getMainBranch()
  try {
    const result = await $`git diff ${mainBranch}...HEAD`
    return result.stdout
  } catch {
    return ''
  }
}

/**
 * Extract ticket number from branch name (e.g. IM-1234, JIRA-567)
 * @returns {Promise<string|null>}
 */
export async function extractTicket() {
  const branch = await getCurrentBranch()
  const match = branch.match(/([A-Z]+-\d+)/)
  return match ? match[1] : null
}

/**
 * Check if remote branch exists
 * @param {string} branchName - branch name to check
 * @returns {Promise<boolean>}
 */
async function remoteBranchExists(branchName) {
  try {
    await $`git ls-refs --heads origin ${branchName}`
    return true
  } catch {
    return false
  }
}

/**
 * Push current branch to origin
 * - If remote branch exists: just push (update)
 * - If remote branch doesn't exist: create with upstream tracking
 * @returns {Promise<boolean>}
 */
export async function pushBranch() {
  try {
    // Get current branch name
    const branchResult = await $`git rev-parse --abbrev-ref HEAD`
    const branchName = branchResult.stdout.trim()

    // Check if remote branch already exists
    const exists = await remoteBranchExists(branchName)

    if (exists) {
      // Remote branch exists, just push (supplemental update)
      await $`git push origin ${branchName}`
    } else {
      // Remote branch doesn't exist, create with upstream tracking
      await $`git push -u origin ${branchName}`
    }
    return true
  } catch (error) {
    console.error(`Push failed: ${error.message}`)
    return false
  }
}

/**
 * Get modified (unstaged) files in working tree
 * @returns {Promise<Array<string>>}
 */
export async function getModifiedFiles() {
  const result = await $`git diff --name-only`
  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
}

/**
 * Check if the gh CLI is installed
 * @returns {Promise<boolean>}
 */
export async function hasGhCli() {
  try {
    await $`gh --version`
    return true
  } catch {
    return false
  }
}

/**
 * Check if current branch has a remote tracking branch
 * @returns {Promise<boolean>}
 */
export async function hasRemoteTracking() {
  try {
    await $`git rev-parse --abbrev-ref --symbolic-full-name @{u}`
    return true
  } catch {
    return false
  }
}
