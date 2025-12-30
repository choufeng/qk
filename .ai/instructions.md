# QK CLI 项目指导原则

## 项目概述

QK CLI 是一个使用 Bun、ZX 和 Commander.js 构建的模块化命令行工具。本项目采用命令自动发现机制，所有命令位于 `commands/` 目录下，每个命令作为一个独立的子目录存在。

## 技术栈

- **运行时**: Bun >= 1.0.0
- **CLI 框架**: Commander.js
- **Shell 脚本**: ZX
- **模块系统**: ES Modules (.mjs)
- **包管理器**: Bun

## 项目结构

```
qk/
├── cli.mjs                    # 主入口，自动加载所有命令
├── commands/                  # 命令目录
│   ├── command-name/         # 命令名（自动发现）
│   │   └── script.mjs        # 命令实现脚本
├── lib/                      # 库代码
│   └── ai/                  # AI 相关功能
├── .ai/                      # AI 配置目录
│   ├── instructions.md      # 本文件：项目级指导原则
│   ├── opencode.json        # OpenCode 配置
│   └── product-manager.md   # 产品经理 agent 配置
└── package.json
```

## 命令开发规范

### 命令目录命名

- 使用小写字母、数字和连字符
- 示例：`ai-chat`、`hello-world`、`database-migrate`

### 命令脚本要求

每个命令必须：
1. 在 `commands/{command-name}/` 目录下创建 `script.mjs` 文件
2. 导出一个默认的 `run` 函数，接收 `args` 参数
3. 添加 JSDoc 注释描述命令功能

### 命令示例结构

```javascript
#!/usr/bin/env bun

import { $ } from 'zx';

/**
 * @description 命令的简短描述
 */
export async function run(args) {
  // 扁平化参数
  const flatArgs = args.flat();
  const promptArgs = flatArgs.filter(arg => 
    typeof arg === 'string' && 
    !arg.includes('Command') &&
    !arg.startsWith('{')
  );

  // 命令逻辑
  // ...

  console.log('Command output');
}

export default run;
```

## 代码风格

1. **文件头部**: 所有可执行 `.mjs` 文件必须以 `#!/usr/bin/env bun` 开头
2. **导入顺序**:
   - Node.js 内置模块
   - 第三方模块
   - 项目内相对路径模块
3. **函数导出**: 使用 `export async function run` 和 `export default run`
4. **错误处理**: 使用 try-catch 捕获错误，并提供友好的错误信息
5. **控制台输出**: 使用 `console.log` 输出信息，`console.error` 输出错误

## 使用 Bun

本项目专用于 Bun 运行时，所有操作应优先使用 Bun 命令：
- 运行脚本: `bun script.mjs`
- 安装依赖: `bun install`
- 运行测试: `bun test`

## 参数处理规范

命令接收的 `args` 是一个嵌套数组，需要进行处理：

```javascript
// 过滤有效参数
const flatArgs = args.flat();
const promptArgs = flatArgs.filter(arg => 
  typeof arg === 'string' && 
  !arg.includes('Command') &&
  !arg.startsWith('{')
);
```

## 依赖使用

当前项目依赖：
- `commander`: CLI 框架
- `zx`: Shell 命令执行
- `@langchain/core`: AI 集成（如需要）

在引入新依赖前，优先使用 Bun 内置功能和现有依赖。

## 错误处理

- 提供清晰的错误消息
- 使用 `process.exit(1)` 表示错误退出
- 对于预期外的错误，打印完整的错误堆栈

## 库文件组织

- `lib/ai/` 目录存放 AI 相关功能
- 共享的工具函数放在 `lib/` 下相应目录
- 使用相对路径导入库文件

## 提交代码

在提交代码前：
1. 确保所有命令能被正确发现
2. 测试新命令的基本功能
3. 检查是否有未使用的依赖
4. 更新相关文档（如 README.md）

## AI Agent 使用

本项目使用 OpenCode 作为 AI 助手，配置了完整的 agent 体系。

### Agent 类型

#### 主 Agent（Primary Agents）

| Agent | 描述 | 使用场景 |
|-------|------|----------|
| `build` | 构建 agent，默认主 agent | 日常开发、代码修改 |
| `plan` | 规划 agent，只读模式 | 分析代码、审查建议 |

**切换方式**: 使用 Tab 键循环切换

#### 子 Agent（Subagents）

| Agent | 描述 | 使用方式 |
|-------|------|----------|
| `@product-manager` | 产品经理，需求分析 | `@product-manager 我需要一个密码生成命令` |
| `@architect` | 架构师，技术设计 | `@architect 设计一个数据库命令` |
| `@implementer` | 实现者，代码编写 | `@implementer 实现密码生成逻辑` |
| `@code-reviewer` | 代码审查员，质量把关 | `@code-reviewer 审查这个 PR` |
| `@problem-solver` | 问题解决者，调试修复 | `@problem-solver 命令崩溃了` |
| `@git-specialist` | Git 专家，提交/PR | `@git-specialist 生成提交信息` |

### 工作流程

```
用户需求
   ↓
@product-manager → 需求规格文档
   ↓
@architect → 技术设计方案
   ↓
@implementer → 代码实现
   ↓
@code-reviewer → 代码审查
   ↓
@problem-solver → 调试/修复问题
   ↓
@git-specialist → 提交信息、PR 描述、版本发布
```

### 配置文件

所有 agent 配置位于 `.ai/` 目录：

```
.ai/
├── opencode.json        # 主配置，定义 agent 列表和引用
├── instructions.md      # 项目指导原则
└── modes/               # Agent 模式文件
    ├── product-manager.md
    ├── architect.md
    ├── implementer.md
    ├── code-reviewer.md
    ├── problem-solver.md
    └── git-specialist.md
```

### Agent 配置说明

每个 agent 可配置以下属性：
- `description`: 简要描述
- `mode`: `primary` 或 `subagent`
- `model`: 使用的模型
- `temperature`: 温度（0.0-1.0）
- `maxSteps`: 最大迭代次数
- `prompt`: 引用外部 prompt 文件
- `tools`: 工具权限
- `permission`: 操作权限（`allow`/`ask`/`deny`）
- `disable`: 是否禁用（`true`/`false`）

### 成本控制

为避免过度消耗，为每个 agent 设置了 `maxSteps` 限制：
- `build`: 50 步
- `plan`: 20 步（只读）
- `product-manager`: 15 步
- `architect`: 20 步
- `implementer`: 30 步
- `code-reviewer`: 25 步
- `problem-solver`: 30 步
- `git-specialist`: 15 步
