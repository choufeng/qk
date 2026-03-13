#!/usr/bin/env bun

/**
 * Tests for lib/git/index.mjs
 *
 * Run with: bun test lib/git/index.test.mjs
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test'

// We test the pure logic of path resolution separately from git calls
// by extracting the helper functions

import { resolveGitFiles } from './index.mjs'

describe('resolveGitFiles - includes untracked files', () => {
  test('includes untracked files alongside modified files', () => {
    const gitRoot = '/repo'
    const modifiedFiles = ['src/existing.ts']
    const untrackedFiles = ['src/new-file.ts', 'src/another.ts']
    const allFiles = [...modifiedFiles, ...untrackedFiles]
    const cwd = '/repo'

    const result = resolveGitFiles(gitRoot, allFiles, cwd)

    expect(result).toHaveLength(3)
    expect(result.map(f => f.display)).toContain('src/existing.ts')
    expect(result.map(f => f.display)).toContain('src/new-file.ts')
    expect(result.map(f => f.display)).toContain('src/another.ts')
  })

  test('filters untracked files outside cwd just like modified files', () => {
    const gitRoot = '/repo'
    const allFiles = ['frontend/App.tsx', 'backend/server.ts', 'frontend/new.tsx']
    const cwd = '/repo/frontend'

    const result = resolveGitFiles(gitRoot, allFiles, cwd)

    expect(result).toHaveLength(2)
    expect(result.map(f => f.display)).toContain('App.tsx')
    expect(result.map(f => f.display)).toContain('new.tsx')
  })
})

describe('resolveGitFiles', () => {
  test('returns absolute paths for files relative to git root', () => {
    const gitRoot = '/home/user/myproject'
    const relativeFiles = ['src/foo.ts', 'lib/bar.ts']
    const cwd = '/home/user/myproject'

    const result = resolveGitFiles(gitRoot, relativeFiles, cwd)

    expect(result).toEqual([
      { absolute: '/home/user/myproject/src/foo.ts', display: 'src/foo.ts' },
      { absolute: '/home/user/myproject/lib/bar.ts', display: 'lib/bar.ts' },
    ])
  })

  test('filters out files not under current working directory', () => {
    const gitRoot = '/home/user/myproject'
    const relativeFiles = ['frontend/src/App.tsx', 'backend/server.ts', 'README.md']
    const cwd = '/home/user/myproject/frontend'

    const result = resolveGitFiles(gitRoot, relativeFiles, cwd)

    expect(result).toEqual([
      { absolute: '/home/user/myproject/frontend/src/App.tsx', display: 'src/App.tsx' },
    ])
  })

  test('shows display path relative to cwd', () => {
    const gitRoot = '/repo'
    const relativeFiles = ['packages/ui/Button.tsx']
    const cwd = '/repo/packages'

    const result = resolveGitFiles(gitRoot, relativeFiles, cwd)

    expect(result).toEqual([
      { absolute: '/repo/packages/ui/Button.tsx', display: 'ui/Button.tsx' },
    ])
  })

  test('returns all files when cwd is git root', () => {
    const gitRoot = '/repo'
    const relativeFiles = ['a.ts', 'b/c.ts', 'd/e/f.ts']
    const cwd = '/repo'

    const result = resolveGitFiles(gitRoot, relativeFiles, cwd)

    expect(result).toHaveLength(3)
  })

  test('returns empty array when no files match cwd', () => {
    const gitRoot = '/repo'
    const relativeFiles = ['backend/server.ts']
    const cwd = '/repo/frontend'

    const result = resolveGitFiles(gitRoot, relativeFiles, cwd)

    expect(result).toEqual([])
  })

  test('handles empty file list', () => {
    const result = resolveGitFiles('/repo', [], '/repo')
    expect(result).toEqual([])
  })
})
