# E2E Tags for PR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional E2E tag multi-select feature to the `gpr` command that appends selected tags to the PR description in `[E2E: ...]` format.

**Architecture:** Minimal change to existing gpr flow. Add `e2eTags` to config defaults, insert a `checkbox` prompt after AI generates PR content, and append the formatted line to the description before the editor opens.

**Tech Stack:** Bun, ZX, Commander.js, `@inquirer/prompts` (already installed).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/config/schema.mjs` | Modify | Add `e2eTags` default to `DEFAULT_CONFIG.git` |
| `commands/gpr/script.mjs` | Modify | Import `checkbox`, insert E2E selection flow, append tags to description |

---

### Task 1: Add `e2eTags` to Config Schema

**Files:**
- Modify: `lib/config/schema.mjs:26`

- [ ] **Step 1: Add `e2eTags` array to `DEFAULT_CONFIG.git`**

```javascript
export const DEFAULT_CONFIG = {
  ai: {
    provider: 'ollama',       // 'ollama' | 'vertex'
    language: 'en',           // 'en' | 'zh-CN' | 'zh-TW'
    ...PROVIDER_DEFAULTS,
  },
  git: {
    useLazygit: true,
    autoCommit: false,
    autoPR: false,
    e2eTags: ['@sns', '@titleAndEscrow', '@titleAndEscrowWithBTS'],
  },
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `bun run cli.mjs --help`
Expected: Help output prints without errors.

- [ ] **Step 3: Commit**

```bash
git add lib/config/schema.mjs
git commit -m "feat(config): add default e2eTags to git config"
```

---

### Task 2: Import `checkbox` in gpr script

**Files:**
- Modify: `commands/gpr/script.mjs:7`

- [ ] **Step 1: Add `checkbox` to the existing import from `@inquirer/prompts`**

Change line 7 from:
```javascript
import { confirm, select } from '@inquirer/prompts'
```
to:
```javascript
import { confirm, select, checkbox } from '@inquirer/prompts'
```

- [ ] **Step 2: Verify the import is valid**

Run: `bun run cli.mjs gpr --help`
Expected: No import errors; help or usage info prints.

- [ ] **Step 3: Commit**

```bash
git add commands/gpr/script.mjs
git commit -m "feat(gpr): import checkbox prompt for e2e tag selection"
```

---

### Task 3: Insert E2E Tag Selection Flow

**Files:**
- Modify: `commands/gpr/script.mjs:216-244`

The E2E flow must be inserted **after** the `prContent` is generated (line 216) and **before** the editor opens (line 220).

- [ ] **Step 1: Insert the E2E tag selection block**

After the existing code:
```javascript
} else {
  // 12. Call AI with spinner (only for new PR)
  const spinner = startSpinner(chalk.cyan(`Generating PR content via ${provider}...`))
  let response
  try {
    response = await launch(prompt, { temperature: 0.3 })
  } finally {
    stopSpinner(spinner)
  }
  prContent = parsePrContent(response.content)
}
```

Insert immediately after `prContent = parsePrContent(response.content)` and before the `// 12.1 Open editor` comment:

```javascript
    // 12.1 E2E tag selection (only for new PRs)
    const e2eTags = config.get('git.e2eTags') || []
    if (e2eTags.length > 0 && !prExists) {
      const selectedTags = await checkbox({
        message: 'Select E2E tags for this PR (optional):',
        choices: e2eTags.map(tag => ({ name: tag, value: tag })),
      })

      if (selectedTags.length > 0) {
        const e2eLine = `[E2E: ${selectedTags.join(', ')}]`
        if (prContent.description) {
          prContent.description = prContent.description.trimEnd() + '\n\n' + e2eLine
        } else {
          prContent.description = e2eLine
        }
      }
    }
```

The full surrounding context after insertion should look like:

```javascript
    } else {
      // 12. Call AI with spinner (only for new PR)
      const spinner = startSpinner(chalk.cyan(`Generating PR content via ${provider}...`))
      let response
      try {
        response = await launch(prompt, { temperature: 0.3 })
      } finally {
        stopSpinner(spinner)
      }
      prContent = parsePrContent(response.content)
    }

    // 12.1 E2E tag selection (only for new PRs)
    const e2eTags = config.get('git.e2eTags') || []
    if (e2eTags.length > 0 && !prExists) {
      const selectedTags = await checkbox({
        message: 'Select E2E tags for this PR (optional):',
        choices: e2eTags.map(tag => ({ name: tag, value: tag })),
      })

      if (selectedTags.length > 0) {
        const e2eLine = `[E2E: ${selectedTags.join(', ')}]`
        if (prContent.description) {
          prContent.description = prContent.description.trimEnd() + '\n\n' + e2eLine
        } else {
          prContent.description = e2eLine
        }
      }
    }

    // 12.2 Open editor (unless --no-edit, --dry-run, autoPR, or PR already exists)
    if (!noEdit && !dryRun && autoPR !== true && !prExists) {
```

> Note: The original `// 12.1 Open editor` comment should be updated to `// 12.2 Open editor` to keep step numbers consistent.

- [ ] **Step 2: Update the editor comment step number**

Change:
```javascript
    // 12.1 Open editor (unless --no-edit, --dry-run, autoPR, or PR already exists)
```
to:
```javascript
    // 12.2 Open editor (unless --no-edit, --dry-run, autoPR, or PR already exists)
```

- [ ] **Step 3: Verify the script parses without errors**

Run: `bun run cli.mjs gpr --help`
Expected: No syntax errors.

- [ ] **Step 4: Commit**

```bash
git add commands/gpr/script.mjs
git commit -m "feat(gpr): add E2E tag multi-select before editor"
```

---

### Task 4: Manual End-to-End Verification

**Files:**
- None (manual test)

- [ ] **Step 1: Create a temporary test branch with a dummy change**

```bash
git checkout -b test/e2e-tag-verification
echo "# test" >> README.md
git add README.md
git commit -m "test: dummy change for e2e tag verification"
```

- [ ] **Step 2: Run gpr in dry-run mode and observe the E2E prompt**

```bash
bun run cli.mjs gpr --dry-run
```

Expected interaction:
1. Branch pushed.
2. AI generates content.
3. Prompt appears:
   ```
   ? Select E2E tags for this PR (optional): (Press <space> to select, <a> to toggle all, <i> to invert selection)
   ❯◯ @sns
    ◯ @titleAndEscrow
    ◯ @titleAndEscrowWithBTS
   ```
4. Select `@sns` and `@titleAndEscrow` with Space, press Enter.
5. Preview shows description ending with:
   ```
   [E2E: @sns, @titleAndEscrow]
   ```
6. Because `--dry-run`, no PR is created.

- [ ] **Step 3: Test with no selections**

Run again: `bun run cli.mjs gpr --dry-run`
This time press Enter without selecting any tags.
Expected: Description does NOT contain `[E2E: ...]`.

- [ ] **Step 4: Test with empty config**

Temporarily edit `~/.config/qk/config.yaml` to set `git.e2eTags: []`, then run:
```bash
bun run cli.mjs gpr --dry-run
```
Expected: No E2E prompt appears.

Restore config after test.

- [ ] **Step 5: Clean up test branch**

```bash
git checkout feature/e2e-tags-for-pr
git branch -D test/e2e-tag-verification
git push origin --delete test/e2e-tag-verification 2>/dev/null || true
```

- [ ] **Step 6: Commit**

No code changes to commit for this task (manual verification only).

---

## Self-Review Checklist

1. **Spec coverage:**
   - [x] Config `e2eTags` default added → Task 1
   - [x] `checkbox` import → Task 2
   - [x] Multi-select prompt after AI generation → Task 3
   - [x] Append `[E2E: ...]` to description with correct formatting → Task 3
   - [x] Only for new PRs (`!prExists`) → Task 3
   - [x] Skip if `e2eTags` is empty → Task 3
   - [x] Skip if no tags selected → Task 3
   - [x] Manual verification steps → Task 4

2. **Placeholder scan:** No TBD, TODO, or vague steps found.

3. **Type consistency:** `config.get('git.e2eTags')` returns the array defined in schema. `checkbox` choices expect `{ name, value }` objects. Both are consistent.

---

## Execution Options

**Plan complete and saved to `docs/superpowers/plans/2026-04-23-e2e-tags-for-pr.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
