# PR Labels Selection Design

## Overview

Add an optional PR label multi-select feature to the `gpr` (GitHub Pull Request) command. Before opening the editor or finalizing a new PR, users can select one or more labels from a curated whitelist. The selected labels are attached to the PR via the `gh pr create --label` flag.

## Motivation

Teams use GitHub labels to categorize PRs (e.g., `bug`, `enhancement`, `documentation`). Currently, `gpr` does not support attaching labels during creation, forcing users to manually add labels via the GitHub web UI after the PR is created. Automating this via a multi-select prompt reduces friction and ensures consistent labeling.

## Configuration

### Schema Change (`lib/config/schema.mjs`)

Add `prLabels` under the existing `git` section of `DEFAULT_CONFIG`:

```javascript
git: {
  useLazygit: true,
  autoCommit: false,
  autoPR: false,
  e2eTags: ['@sns', '@titleAndEscrow', '@titleAndEscrowWithBTS'],
  prLabels: ['bug', 'enhancement', 'documentation', 'help wanted'],
}
```

- The array holds label name strings.
- Users can freely add, remove, or reorder labels via `~/.config/qk/config.yaml`.
- If the array is empty or missing, the label selection prompt is skipped entirely.

## Behavior

### Trigger Condition

The prompt appears only when **all** of the following are true:
1. It is a **new PR** (not an update to an existing PR).
2. The config value `git.prLabels` is a non-empty array.
3. The remote repository has at least one label that intersects with the configured whitelist.
4. It is **not** a `--dry-run` (labels cannot be previewed meaningfully).

### Remote Label Retrieval

Use `gh label list` to fetch remote labels:

```javascript
const remoteLabels = await $`gh label list --json name --jq '.[].name'`
  .then(r => r.stdout.trim().split('\n').filter(Boolean))
  .catch(() => [])
```

If the command fails (e.g., no permissions, network issue), treat it as an empty list and skip the prompt silently.

### Intersection with Whitelist

```javascript
const availableLabels = remoteLabels.filter(name => prLabels.includes(name))
```

Only labels present in both the remote repository and the user's whitelist are shown.

### User Interaction

Use `@inquirer/prompts` `checkbox` prompt:

```
? Select labels for this PR (optional): (Press <space> to select, <a> to toggle all, <i> to invert selection)
❯◯ bug
 ◯ enhancement
 ◯ documentation
```

- Selection is optional; pressing Enter with no selections skips attaching labels.
- Supports toggling all (`a`) and inverting (`i`) for convenience.

### PR Creation Command Modification

If one or more labels are selected, append `--label <name>` arguments to the `gh pr create` command:

```javascript
const labelArgs = selectedLabels.flatMap(l => ['--label', l])
const createCmd = isDraft
  ? $`gh pr create --title ${prContent.title} --body-file ${bodyFile} --head ${currentBranch} --draft ${labelArgs}`
  : $`gh pr create --title ${prContent.title} --body-file ${bodyFile} --head ${currentBranch} ${labelArgs}`
```

### Insertion Point in `gpr/script.mjs`

The label selection flow is inserted **after** the E2E tag selection (step 12.1) and **before** the editor opens (step 12.2).

```
AI generates PR content
  → E2E tag selection (existing)
  → Label selection (new)
  → Open editor
  → Draft/Ready selection
  → Confirm
  → Create PR
```

## Edge Cases

| Scenario | Handling |
|----------|----------|
| `prLabels` is an empty array `[]` | Skip the prompt entirely. |
| `gh label list` fails | Treat as empty list, skip prompt silently. |
| Whitelist and remote labels have no intersection | Skip the prompt silently. |
| User selects nothing | Do not modify the `gh pr create` command. |
| `--dry-run` | Skip the label selection prompt. |
| Existing PR update (`prExists === true`) | Skip the label selection prompt. |

## Files Modified

1. `lib/config/schema.mjs` — add `prLabels` default.
2. `commands/gpr/script.mjs` — insert label retrieval, filtering, selection logic, and command modification.

## No New Dependencies

The project already depends on `@inquirer/prompts` which includes `checkbox`, and `zx` which is already used. No additional packages are required.

## Relationship with E2E Tags

The `prLabels` feature is **independent** of the existing `e2eTags` feature:
- `e2eTags` appends text to the PR description body.
- `prLabels` attaches GitHub labels to the PR via `gh` CLI flags.
- Both can be used together, neither depends on the other.

## Future Extensions (Out of Scope)

- Allow fetching all remote labels without a whitelist.
- Support label creation if the selected label does not exist on the remote.
- Support editing labels on existing PR updates.
