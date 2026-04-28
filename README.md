# QK CLI

A modular command-line tool built with Bun, ZX, and Commander.js. QK provides a collection of AI-powered and developer-friendly commands to streamline your Git workflow, package management, and more.

## Installation

### Prerequisites

Before installing QK, make sure you have [Bun](https://bun.sh) installed:

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash
```

### Install QK via Homebrew

```bash
# Add the tap and install
brew tap choufeng/qk && brew install qk
```

## Commands

| Command | Description |
|---------|-------------|
| `qk set` | Interactive global configuration for qk |
| `qk gc` | AI-powered commit message generator |
| `qk gpr` | AI-powered Pull Request generator |
| `qk pack` | Chain-build packages and apps based on dependency order |
| `qk pack-watch` | Check and clean up residual processes from pack |
| `qk chat [prompt]` | Test AI integration with LangChain |
| `qk hello-world` | Print hello world message |

## Usage

### Configuration

```bash
qk set
```

### Git Workflow

```bash
# Generate commit message with AI
qk gc

# Create a Pull Request with AI
qk gpr
```

### Package Building

```bash
# Build packages in dependency order
qk pack

# Clean up residual processes from pack
qk pack-watch --kill
```

### AI Chat

```bash
# Chat with AI
qk chat "Your question or prompt"
```

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
