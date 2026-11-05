# Doubao CLI Provider for Paseo

[English](./README.md) | [简体中文](./README.zh-CN.md)

Paseo provider plugin for the Doubao coding agent CLI (`doubao`). Integrates local Doubao CLI capabilities directly into Paseo desktop, web, mobile, and CLI environments with full Provider Protocol v1 compatibility.

---

## ✨ Features

- **Protocol v1 Compliant**: Native integration with Paseo's provider connection lifecycle, session configuration, and timeline event streaming.
- **Dynamic Catalog Discovery**: Zero hardcoded models or thinking levels. Available models (`--model`), reasoning efforts (`--effort`), and permission modes (`--permission-mode`) are probed dynamically from the installed `doubao` CLI binary at runtime.
- **Continuous Session Persistence**: Captures native Doubao session IDs from stderr output and maps them to Paseo persistence tokens, enabling multi-turn conversation continuation via `--resume`.
- **Session History Discovery**: Implements `session.list` to discover and list existing Doubao CLI sessions through `doubao --list`.
- **Process & Stdio Guardrails**: Handles stdio pipe attachment gracefully without interactive TTY requirements, preventing standard input connection deadlocks during background execution.

---

## 📋 Prerequisites

Ensure `doubao` CLI is installed and available in your environment's `PATH`:

```bash
# Verify CLI installation
doubao --version

# Check login status
doubao auth status

# If not authenticated, log in
doubao login
```

---

## 🚀 Installation

### Option 1: Using Paseo CLI

Navigate to this plugin directory (or pass its path) and install:

```bash
paseo plugin install .
```

### Option 2: Using Paseo Desktop / Web App

1. Open **Settings** → **Plugins**.
2. Under **Plugin source**, enter the path to this directory.
3. Click **Install plugin**.

---

## ⚙️ Configuration & Usage

Once installed, the provider is registered as `doubao` in your Paseo daemon.

### Check Provider Status

```bash
paseo provider ls
paseo provider diagnostic doubao
```

### Inspect Dynamically Discovered Models

```bash
paseo provider models doubao
```

### Launch an Agent Task

```bash
# Run a quick task with default settings
paseo run --provider doubao "Explain this codebase structure."

# Specify model and thinking effort
paseo run --provider doubao --model "Doubao 2.1 Pro" --thinking high "Refactor the database queries."

# Continue conversation in the same session
paseo send <agent-id> "Can you add unit tests for those changes?"
```

---

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run type checking
npm run typecheck

# Reload the plugin in Paseo after changes
paseo plugin reload doubao-cli-paseo
```

---

## 📄 License

Apache-2.0
