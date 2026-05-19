# E2E Tags for PR Design

## Overview

Add an optional E2E tag multi-select feature to the `gpr` (GitHub Pull Request) command. Before opening the editor or finalizing a new PR, users can select one or more predefined E2E tags. The selected tags are appended to the PR description in the fixed format `[E2E: @tag1, @tag2]`.

## Motivation

When creating PRs, team members often need to indicate which end-to-end test suites are relevant. Currently this is done manually. Automating this via a multi-select prompt reduces friction and ensures consistent formatting.

## Configuration

### Schema Change (`lib/config/schema.mjs`)

Add `e2eTags` under the existing `git` section of `DEFAULT_CONFIG`:

```javascript
git: {
  useLazygit: true,
  autoCommit: false,
  autoPR: false,
  e2eTags: ['@sns', '@titleAndEscrow', '@titleAndEscrowWithBTS'],
}
```

- The array holds tag strings (including the `@` prefix).
- Users can freely add, remove, or reorder tags via `~/.config/qk/config.yaml`.
- If the array is empty or missing, the multi-select prompt is skipped entirely.

## Behavior

### Trigger Condition

The prompt appears only when **all** of the following are true:
1. It is a **new PR** (not an update to an existing PR).
2. The config value `git.e2eTags` is a non-empty array.

### Insertion Point in `gpr/script.mjs`

After AI generates `prContent` (step 12), and **before** opening the editor (step 12.1), insert the E2E tag selection flow.

### User Interaction

Use `@inquirer/prompts` `checkbox` prompt:

```
? Select E2E tags for this PR (optional): (Press <space> to select, <a> to toggle all, <i> to invert selection)
❯◯ @sns
 ◯ @titleAndEscrow
 ◯ @titleAndEscrowWithBTS
```

- Selection is optional; pressing Enter with no selections skips appending.
- Supports toggling all (`a`) and inverting (`i`) for convenience.

### Output Format

If one or more tags are selected, append to the end of `prContent.description`:

```
[E2E: @sns, @titleAndEscrow]
```

- Prefix `E2E:` and brackets `[]` are fixed.
- Tags are joined by `, ` (comma + space).
- If `description` is non-empty, prepend two newlines before appending.
- If `description` is empty, set it directly to the E2E line.

## Edge Cases

| Scenario | Handling |
|----------|----------|
| `e2eTags` is an empty array `[]` | Skip the prompt entirely. |
| User selects nothing | Do not modify the description. |
| `description` is empty or whitespace only | Set description to `[E2E: ...]`. |
| `description` ends with trailing whitespace/newlines | Trim trailing whitespace, then append `\n\n[E2E: ...]`. |
| Existing PR update (`prExists === true`) | Do not show the prompt; preserve the existing description. |
| `--dry-run` or `--no-edit` | The prompt still appears before the preview/exit, because the user may want to see the final description including tags in the dry-run preview. |

## Files Modified

1. `lib/config/schema.mjs` — add `e2eTags` default.
2. `commands/gpr/script.mjs` — insert E2E tag selection logic and append to description.

## No New Dependencies

The project already depends on `@inquirer/prompts` which includes `checkbox`. No additional packages are required.

## Future Extensions (Out of Scope)

- Allow customizing the `[E2E: ...]` prefix/suffix format via config.
- Support per-repository E2E tag overrides (currently only global config).
