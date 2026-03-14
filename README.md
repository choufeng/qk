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
| `qk release` | Manage GitHub releases and version tags |
| `qk ai-chat [prompt]` | Test AI integration with LangChain |
| `qk hello-world` | Print hello world message |

## Usage

### Configuration

```bash
qk set
```

### Git Workflow

```bash
# Generate commit message with AI
qk gc "Your commit description"

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

### Release Management

```bash
# Create a new release
qk release major  # or minor, patch

# List all releases
qk release list
```

### AI Chat

```bash
# Chat with AI
qk ai-chat "Your question or prompt"
```
