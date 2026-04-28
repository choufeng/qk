# Auto Version Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 PR 合并后自动升级版本号并触发 GitHub Release 的全自动化流程

**Architecture:** 通过两个脚本（parse-version.js 和 bump-version.js）解析 PR 提交信息并升级版本号，改进 GitHub Actions workflow 实现两阶段流程（版本升级 + 构建发布）

**Tech Stack:** Node.js (Bun 运行时), GitHub Actions, Conventional Commits

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `.github/scripts/parse-version.js` | 创建 | 解析 PR 标题、正文和提交信息，确定版本升级级别（major/minor/patch） |
| `.github/scripts/bump-version.js` | 创建 | 根据升级级别计算新版本号并更新 package.json |
| `.github/workflows/release.yml` | 修改 | 实现两阶段 workflow（版本升级 + 构建发布） |

---

### Task 1: 创建版本解析脚本

**Files:**
- Create: `.github/scripts/parse-version.js`

- [ ] **Step 1: 创建 parse-version.js 脚本**

```javascript
#!/usr/bin/env bun

import { readFileSync } from 'fs';

/**
 * 解析 PR 信息，确定版本升级级别
 * 优先级: major > minor > patch
 */

// 从环境变量读取 PR 信息
const prTitle = process.env.PR_TITLE || '';
const prBody = process.env.PR_BODY || '';
const commitsJson = process.env.COMMITS || '[]';

let commits = [];
try {
  commits = JSON.parse(commitsJson);
} catch (e) {
  console.error('Failed to parse commits JSON:', e.message);
}

// 合并所有文本用于分析
const allTexts = [
  prTitle,
  prBody,
  ...commits.map(c => c.message || c.title || '')
].join('\n').toLowerCase();

// 默认版本级别
let level = 'patch';

// 优先级: major > minor > patch
// Major: break, !:, BREAKING CHANGE
if (
  allTexts.includes('break') ||
  allTexts.includes('!:') ||
  allTexts.includes('breaking change')
) {
  level = 'major';
} 
// Minor: feat, feature
else if (
  allTexts.match(/\bfeat\b/) ||
  allTexts.match(/\bfeature\b/) ||
  allTexts.match(/\bfeatures\b/)
) {
  level = 'minor';
}
// Patch: fix, bugfix, 或其他
else if (
  allTexts.match(/\bfix\b/) ||
  allTexts.match(/\bbugfix\b/) ||
  allTexts.match(/\bbug fix\b/)
) {
  level = 'patch';
}

console.log(level);
```

- [ ] **Step 2: 验证脚本可运行**

Run: `cd /Users/jia.xia/development/qk && PR_TITLE="feat: add new feature" node .github/scripts/parse-version.js`
Expected: `minor`

Run: `cd /Users/jia.xia/development/qk && PR_TITLE="fix: bug fix" node .github/scripts/parse-version.js`
Expected: `patch`

Run: `cd /Users/jia.xia/development/qk && PR_TITLE="break: api change" node .github/scripts/parse-version.js`
Expected: `major`

- [ ] **Step 3: Commit**

```bash
git add .github/scripts/parse-version.js
git commit -m "feat: add version parsing script for auto-release"
```

---

### Task 2: 创建版本升级脚本

**Files:**
- Create: `.github/scripts/bump-version.js`

- [ ] **Step 1: 创建 bump-version.js 脚本**

```javascript
#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'fs';

/**
 * 根据指定的升级级别计算新版本号并更新 package.json
 * Usage: node bump-version.js <level>
 * Level: major, minor, patch
 */

const level = process.argv[2] || 'patch';

if (!['major', 'minor', 'patch'].includes(level)) {
  console.error('Invalid level. Use: major, minor, or patch');
  process.exit(1);
}

const pkgPath = 'package.json';

// 读取当前版本
let pkg;
try {
  pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
} catch (e) {
  console.error('Failed to read package.json:', e.message);
  process.exit(1);
}

if (!pkg.version) {
  console.error('package.json missing version field');
  process.exit(1);
}

// 解析版本号
const versionParts = pkg.version.split('.').map(Number);

if (versionParts.length !== 3 || versionParts.some(isNaN)) {
  console.error('Invalid version format. Expected: x.y.z');
  process.exit(1);
}

let [major, minor, patch] = versionParts;
let newVersion;

// 计算新版本号
switch (level) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
}

// 更新 package.json
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(newVersion);
```

- [ ] **Step 2: 验证脚本可运行**

Run: `cd /Users/jia.xia/development/qk && node .github/scripts/bump-version.js minor`
Expected: 版本号升级（如 1.9.1 → 1.10.0），package.json 已更新

Run: `cd /Users/jia.xia/development/qk && node .github/scripts/bump-version.js patch`
Expected: 版本号升级（如 1.10.0 → 1.10.1），package.json 已更新

- [ ] **Step 3: 恢复 package.json 并 Commit**

```bash
git checkout package.json
git add .github/scripts/bump-version.js
git commit -m "feat: add version bump script for auto-release"
```

---

### Task 3: 改进 GitHub Actions Workflow

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: 备份当前 workflow 文件**

```bash
cp .github/workflows/release.yml .github/workflows/release.yml.backup
```

- [ ] **Step 2: 重写 release.yml 为两阶段流程**

```yaml
name: Release

on:
  pull_request:
    branches:
      - main
      - master
    types:
      - closed

  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  # Stage 1: 版本升级（PR 合并时）
  version-bump:
    name: Bump Version
    runs-on: ubuntu-latest
    if: github.event.pull_request.merged == true
    outputs:
      new_version: ${{ steps.bump.outputs.new_version }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Parse commits and determine version level
        id: parse
        run: |
          LEVEL=$(node .github/scripts/parse-version.js)
          echo "level=$LEVEL" >> $GITHUB_OUTPUT
          echo "Version level determined: $LEVEL"
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
          PR_BODY: ${{ github.event.pull_request.body }}
          COMMITS: ${{ toJSON(github.event.pull_request.commits) }}
      
      - name: Bump version
        id: bump
        run: |
          NEW_VERSION=$(node .github/scripts/bump-version.js ${{ steps.parse.outputs.level }})
          echo "new_version=$NEW_VERSION" >> $GITHUB_OUTPUT
          echo "New version: $NEW_VERSION"
      
      - name: Commit and push version bump
        run: |
          git config user.name "GitHub Actions"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add package.json
          git commit -m "chore: release v${{ steps.bump.outputs.new_version }} [release]"
          git push origin main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Create and push tag
        run: |
          TAG="v${{ steps.bump.outputs.new_version }}"
          git tag $TAG
          git push origin $TAG
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # Stage 2: 构建和发布（tag 推送时）
  build-and-release:
    name: Build and Release
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest
      
      - name: Install dependencies
        run: bun install
      
      - name: Verify CLI
        run: |
          bun cli.mjs --version
          bun cli.mjs --help
      
      - name: Generate changelog
        id: changelog
        run: |
          PREVIOUS_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
          
          if [ -n "$PREVIOUS_TAG" ]; then
            CHANGELOG=$(git log --pretty=format:"- %s (%h)" ${PREVIOUS_TAG}..HEAD)
          else
            CHANGELOG=$(git log --pretty=format:"- %s (%h)")
          fi
          
          echo "changelog<<EOF" >> $GITHUB_OUTPUT
          echo "$CHANGELOG" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ github.ref_name }}
          name: QK CLI ${{ github.ref_name }}
          body: |
            ## QK CLI ${{ github.ref_name }}
            
            ### 📦 Installation
            
            ```bash
            # Install via Homebrew
            brew tap choufeng/qk && brew install qk
            
            # Or clone and build
            git clone https://github.com/choufeng/qk.git
            cd qk
            bun install
            ```
            
            ### 📋 Changes
            
            ${{ steps.changelog.outputs.changelog }}
            
            ---
            
            *Released on $(date -u +"%Y-%m-%d %H:%M:%S UTC")*
          draft: false
          prerelease: ${{ contains(github.ref_name, '-') }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Notify completion
        run: |
          echo "✅ Release ${{ github.ref_name }} created successfully!"
          echo "📦 Archives:"
          echo "  • https://github.com/${{ github.repository }}/archive/refs/tags/${{ github.ref_name }}.tar.gz"
          echo "  • https://github.com/${{ github.repository }}/archive/refs/tags/${{ github.ref_name }}.zip"
```

- [ ] **Step 3: 删除备份文件**

```bash
rm .github/workflows/release.yml.backup
```

- [ ] **Step 4: Commit workflow 更改**

```bash
git add .github/workflows/release.yml
git commit -m "feat: implement two-stage auto-release workflow"
```

---

### Task 4: 清理旧配置和测试

**Files:**
- Modify: `.github/release.yml` (可选，保留作为文档)

- [ ] **Step 1: 验证 workflow 语法**

使用在线 YAML 验证器或 GitHub Actions 页面检查语法

- [ ] **Step 2: 更新 README.md 说明**

在 README.md 中添加自动版本管理说明：

```markdown
## Automatic Versioning

When a PR is merged to main/master, the version is automatically bumped based on commit messages:

- `feat:` or `feature:` → minor version (1.9.1 → 1.10.0)
- `fix:` or `bugfix:` → patch version (1.9.1 → 1.9.2)
- `break:` or `!:` → major version (1.9.1 → 2.0.0)

The release workflow will:
1. Parse PR title and commits
2. Bump version in package.json
3. Create and push a git tag
4. Generate GitHub Release with changelog
5. GitHub automatically creates source archives (.tar.gz, .zip)
```

- [ ] **Step 3: Commit 文档更新**

```bash
git add README.md
git commit -m "docs: add automatic versioning documentation"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] 版本号生成策略（基于提交信息）→ Task 1, Task 2
- [x] 工作流程设计（两阶段）→ Task 3
- [x] 避免无限循环（[release] 标记）→ Task 3 (commit message)
- [x] 版本解析脚本 → Task 1
- [x] 版本升级脚本 → Task 2
- [x] 改进的 release.yml → Task 3

**2. Placeholder scan:**
- ✅ 无 TBD、TODO 或未完成的步骤
- ✅ 所有代码块都是完整的
- ✅ 测试命令包含预期输出

**3. Type consistency:**
- ✅ 脚本使用一致的 Node.js/Bun 语法
- ✅ Workflow 中的步骤引用正确的脚本路径

**4. No placeholder patterns found:**
- ✅ 每个步骤都包含具体代码或命令
- ✅ 没有 "implement later" 或 "add appropriate error handling" 等模糊描述

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-28-auto-version.md`. 

**Two execution options:**

**1. Subagent-Driven (recommended)** - 每个任务派发一个独立的 subagent，任务间进行审查，快速迭代

**2. Inline Execution** - 在当前会话中使用 executing-plans 执行，批量执行并设置检查点

选择哪种方式？
