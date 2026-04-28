# Pack Branch Switching Design

**Date:** 2026-04-28  
**Feature:** `qk pack --c` — interactive branch switching between package builds

## Background

`qk pack` executes a chain of package and app builds in dependency order. Each package item produces a `.tgz` tarball consumed by downstream items. The goal is to allow developers to work on different packages across different git branches, then switch branches between builds so each package is built from its own branch's code, before finally landing on the app's branch for the final integration step.

## CLI Interface

New boolean flag added to `qk pack`:

```
qk pack <config-name> --c
qk pack modal-lab --c
```

- Flag: `--c`
- Type: boolean, default `false`
- When present: after each `package` type item completes, prompt the user to optionally switch branches before the next step proceeds

Registered in `script.mjs` via Commander.js:

```js
.option('--c', 'prompt branch switch after each package build')
```

## Execution Flow

```
load config → validate deps → topological sort → execute items in order

  [package item]
    1. Generate alpha version
    2. Backup package.json
    3. Update version + dependency paths
    4. Execute commands (serial/parallel)
    5. Find generated .tgz
    6. Restore package.json
    → onPackageComplete hook fires (if --c is set)
      → list local branches sorted by recent activity
      → user selects branch or skips
      → if selected: check clean working tree, then git checkout

  [app item]
    1. Backup package.json
    2. Update dependency paths
    3. Execute commands
    4. Restore package.json
    → no hook (app is always the end of chain)
```

Typical sequence with 2 packages + 1 app:

```
package-A built → prompt → user switches to branch-B
package-B built → prompt → user switches to branch-app
app executes on branch-app → done
```

## `executeChain` Hook Extension

`functions.mjs` signature change:

```js
export async function executeChain(items, options = {})
```

Hook fires after every `package` item regardless of position — including the last package before an app. The `app` type never triggers the hook.

```js
for (const item of sortedItems) {
  if (item.type === 'package') {
    const result = await executePackageItem(item, dependencyOutputs);
    dependencyOutputs[item.name] = result;

    if (options.onPackageComplete) {
      await options.onPackageComplete(item);
    }
  } else {
    await executeAppItem(item, dependencyOutputs);
  }
}
```

## Branch List Display

Branches are fetched and sorted by most recent commit date (descending) so the most actively worked branches appear first. The current branch is excluded from the list since switching to it is a no-op.

Each branch entry shows the branch name alongside its latest commit subject to aid identification.

```js
const branchOutput = await $`git for-each-ref refs/heads/ --sort=-committerdate --format=%(refname:short)|%(subject)`.text();
const currentBranch = (await $`git branch --show-current`.text()).trim();

const branches = branchOutput
  .split('\n')
  .map(line => {
    const [name, ...subjectParts] = line.split('|');
    return { name: name.trim(), subject: subjectParts.join('|').trim() };
  })
  .filter(b => b.name && b.name !== currentBranch);

const choices = [
  { name: '(skip - stay on current branch)', value: null },
  ...branches.map(b => ({
    name: `${b.name}  ${b.subject ? `— ${b.subject}` : ''}`,
    value: b.name
  }))
];
```

Example prompt:

```
[modal-agent] Switch branch before next step?
❯ (skip - stay on current branch)
  feature/modal-lab-v2  — feat: add new modal layout
  feature/fix-orders    — fix: order list pagination
  main                  — Merge pull request #37
```

## Error Handling

**Dirty working tree:** If the user selects a branch to switch to and the working tree has uncommitted changes, an error is thrown and the pack chain halts. The user must commit or stash their changes and re-run `qk pack`. No automatic stashing.

**User cancels prompt (Ctrl+C):** Caught as `ExitPromptError`, prints `\nPrompt cancelled.` and exits with code 0 — treated as intentional user exit, not an error.

```js
async function promptBranchSwitch(item) {
  try {
    // select prompt → git status check → git checkout
  } catch (error) {
    if (error.name === 'ExitPromptError' || error.message?.includes('User force closed')) {
      console.log('\nPrompt cancelled.');
      process.exit(0);
    }
    throw error;
  }
}
```

## Files Changed

| File | Change |
|------|--------|
| `commands/pack/script.mjs` | Register `--c` flag; define `promptBranchSwitch`; pass `onPackageComplete` to `executeChain` |
| `commands/pack/functions.mjs` | Add `options` parameter to `executeChain`; call `options.onPackageComplete` after each package item |

Total new logic: ~40 lines.
