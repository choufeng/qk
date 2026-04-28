#!/usr/bin/env bun

import { describe, test, expect, mock, afterEach } from 'bun:test'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { executeChain } from './functions.mjs'

const TEST_ROOT = '/tmp/qk-unit-test-' + process.pid

function writePkg(dir, name, deps = {}) {
  mkdirSync(dir, { recursive: true })
  const pkg = { name, version: '1.0.0' }
  if (Object.keys(deps).length > 0) pkg.dependencies = deps
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
}

function makeItems() {
  const a = join(TEST_ROOT, 'pkg-a')
  const b = join(TEST_ROOT, 'pkg-b')
  const app = join(TEST_ROOT, 'my-app')
  writePkg(a, 'pkg-a')
  writePkg(b, 'pkg-b', { 'pkg-a': '1.0.0' })
  writePkg(app, 'my-app', { 'pkg-b': '1.0.0' })
  return [
    { name: 'pkg-a', type: 'package', dir: a, commands: ['touch fake.tgz'] },
    { name: 'pkg-b', type: 'package', dir: b, commands: ['touch fake.tgz'], depends_on: 'pkg-a' },
    { name: 'my-app', type: 'app', dir: app, commands: [] },
  ]
}

describe('executeChain - onPackageComplete hook', () => {
  afterEach(() => {
    rmSync(TEST_ROOT, { recursive: true, force: true })
  })

  test('calls onPackageComplete after each package item, not after app items', async () => {
    const called = []
    const hook = mock(async (item) => { called.push(item.name) })

    await executeChain(makeItems(), { onPackageComplete: hook })

    expect(called).toEqual(['pkg-a', 'pkg-b'])
  })

  test('does not throw when options is omitted entirely', async () => {
    await executeChain(makeItems())
  })
})
