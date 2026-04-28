# QK CLI 自动版本管理设计

## 目标

解决当前版本发布机制的缺陷：PR 合并后若 Action 失败，会导致版本未更新且打包未触发。改为全自动化流程：PR 合并成功后，自动生成版本号并提交，触发 GitHub Release。

## 核心设计

### 版本号生成策略

基于 Conventional Commits 规范，解析 PR 的提交信息：

| 提交前缀 | 版本变更 | 示例 |
|---------|---------|------|
| `feat:` 或 `features:` | minor | 1.9.1 → 1.10.0 |
| `fix:` 或 `bugfix:` | patch | 1.9.1 → 1.9.2 |
| `break:` 或包含 `!` | major | 1.9.1 → 2.0.0 |
| 其他 | patch | 1.9.1 → 1.9.2 |

**优先级**：major > minor > patch（如果同时存在多个类型，取最高级别）

### 工作流程

```
PR 合并到 main
    ↓
GitHub Actions 触发 (pull_request closed)
    ↓
检查: PR 是否合并成功？
    ↓ 否 → 结束
    ↓ 是
    ↓
读取 PR 标题和提交信息
    ↓
解析关键词 → 确定版本升级级别 (major/minor/patch)
    ↓
读取当前版本号 (package.json)
    ↓
计算新版本号
    ↓
更新 package.json 版本号
    ↓
提交: "chore: release v1.9.2 [release]"
    ↓
推送变更 → 触发新的 workflow
    ↓
新的 workflow 检测到版本 tag 不存在
    ↓
创建 Git tag → 运行测试 → 创建 GitHub Release
```

### 避免无限循环

**关键**：提交信息包含 `[release]` 标记时，跳过版本检查，避免重复触发。

### 改进后的 Workflow 设计

**单个 Workflow，两个阶段**：

1. **版本升级阶段**（PR 合并时触发）
   - 解析提交信息
   - 计算新版本号
   - 更新 package.json
   - 提交并推送（使用 `[release]` 标记）
   - 创建并推送 Git tag

2. **构建发布阶段**（tag 推送时触发）
   - 运行测试
   - 创建 GitHub Release
   - GitHub 自动生成源码归档

**触发条件分离**：
- Stage 1: `pull_request: closed`（仅合并时）
- Stage 2: `push: tags: v*`

这样避免了循环触发，逻辑清晰。

## 实现细节

### 版本解析脚本

创建 `.github/scripts/parse-version.js`：

```javascript
import { readFileSync } from 'fs';

const prTitle = process.env.PR_TITLE || '';
const prBody = process.env.PR_BODY || '';
const commits = JSON.parse(process.env.COMMITS || '[]');

// 合并所有文本
const allText = [prTitle, prBody, ...commits.map(c => c.message)].join('\n').toLowerCase();

// 优先级: major > minor > patch
let level = 'patch'; // 默认

if (allText.includes('break') || allText.includes('!:'))) {
  level = 'major';
} else if (allText.match(/\bfeat\b/) || allText.match(/\bfeature\b/)) {
  level = 'minor';
} else if (allText.match(/\bfix\b/) || allText.match(/\bbugfix\b/)) {
  level = 'patch';
}

console.log(level);
```

### 版本升级脚本

创建 `.github/scripts/bump-version.js`：

```javascript
import { readFileSync, writeFileSync } from 'fs';

const level = process.argv[2] || 'patch';
const pkgPath = 'package.json';
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

const [major, minor, patch] = pkg.version.split('.').map(Number);

let newVersion;
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

pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(newVersion);
```

### 改进的 release.yml

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
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Parse commits and determine version level
        id: parse
        run: |
          LEVEL=$(node .github/scripts/parse-version.js)
          echo "level=$LEVEL" >> $GITHUB_OUTPUT
          echo "Version level: $LEVEL"
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
      - name: Checkout
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
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: ${{ github.ref_name }}
          name: QK CLI ${{ github.ref_name }}
          draft: false
          prerelease: ${{ contains(github.ref_name, '-') }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Notify
        run: |
          echo "✅ Release ${{ github.ref_name }} created successfully!"
          echo "📦 Archives: https://github.com/${{ github.repository }}/archive/refs/tags/${{ github.ref_name }}.tar.gz"
```

## 关键改进点

1. **原子性**：版本升级和 Release 在同一个 workflow 文件，逻辑集中
2. **避免循环**：Stage 1 只在 PR 合并时触发，Stage 2 只在 tag 推送时触发
3. **自动版本**：不再需要手动修改 package.json
4. **容错性**：如果 Stage 2 失败，可以手动重新运行（tag 已创建）

## 测试计划

1. 创建一个测试 PR，标题包含 `feat: add new feature`
2. 合并 PR，观察 Actions 是否自动升级 minor 版本
3. 验证 package.json 是否更新，tag 是否创建
4. 验证 GitHub Release 是否自动生成

---

*设计文档版本: 1.0*
*创建日期: 2026-04-28*
