#!/usr/bin/env bun

import { describe, test, expect, mock } from 'bun:test'
import { executeChain } from './functions.mjs'

const makeItems = () => [
  { name: 'pkg-a', type: 'package', dir: '/tmp/pkg-a', commands: [] },
  { name: 'pkg-b', type: 'package', dir: '/tmp/pkg-b', commands: [], depends_on: 'pkg-a' },
  { name: 'my-app', type: 'app', dir: '/tmp/my-app', commands: [], depends_on: 'pkg-b' },
]

describe('executeChain - onPackageComplete hook', () => {
  test('calls onPackageComplete after each package item, not after app items', async () => {
    const called = []
    const hook = mock(async (item) => { called.push(item.name) })

    try {
      await executeChain(makeItems(), { onPackageComplete: hook })
    } catch {
      // filesystem errors are expected in unit test env
    }

    expect(called).toEqual(['pkg-a', 'pkg-b'])
  })

  test('does not throw when options is omitted entirely', async () => {
    let threw = false
    try {
      await executeChain(makeItems())
    } catch (e) {
      // filesystem errors ok, TypeError from missing options is not ok
      if (e instanceof TypeError) threw = true
    }
    expect(threw).toBe(false)
  })
})
