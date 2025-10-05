# Extension Development & Workflow Commands

A comprehensive guide to all available commands for developing and managing the Jarvis4 Worldview Updater extension.

## 🚀 Quick Start

```bash
# Daily development (auto-recompile on save)
pnpm run dev

# Build and install locally
pnpm run install:local

# Test the extension (Press F5 in Cursor)
# Opens Extension Development Host window
```

---

## 📦 Development Workflow

### Active Development
```bash
# Start watch mode (recommended for daily dev)
pnpm run dev
# Runs both esbuild and tsc watchers in parallel
# Auto-recompiles on file changes
```

### Manual Build
```bash
# Compile once
pnpm run build

# Full production build
pnpm run package
```

---

## 🔧 Installation & Packaging

### Create VSIX Package
```bash
# Bundle the extension into a .vsix file
pnpm run bundle
# Creates: jarvis4-worldview-updater-0.0.1.vsix
```

### Install Extension
```bash
# Install any .vsix in current directory
pnpm run install:extension

# OR: Full build + install
pnpm run install:local

# Uninstall the extension
pnpm run uninstall:extension

# Uninstall + rebuild + reinstall
pnpm run reinstall
```

### Manual Installation
```bash
# From CLI
cursor --install-extension jarvis4-worldview-updater-0.0.1.vsix

# Or from Cursor UI:
# Extensions panel → ⋯ → Install from VSIX
```

---

## ✅ Code Quality

### Type Checking
```bash
# Check TypeScript types without building
pnpm run check-types
```

### Linting
```bash
# Check for linting errors
pnpm run lint

# Fix auto-fixable linting errors
pnpm run lint:fix
```

### Formatting
```bash
# Format all TypeScript files with Prettier
pnpm run format
```

---

## 🧪 Testing

### Run Tests
```bash
# Run all tests
pnpm run test

# Watch mode for tests
pnpm run watch-tests

# Compile tests only
pnpm run compile-tests
```

---

## 🛠️ Utilities

### Clean Build Artifacts
```bash
# Remove all build outputs and packages
pnpm run clean
# Deletes: dist/, out/, *.vsix
```

### Reset Everything
```bash
# Clean + reinstall dependencies
pnpm run reset
```

---

## 🎯 Common Workflows

### Daily Development Loop
```bash
# Terminal 1: Start watch mode
pnpm run dev

# Terminal 2 (or use F5 in Cursor):
# Debug → Run Extension
# Makes changes → reload Extension Development Host (Cmd+R)
```

### Testing Changes Locally
```bash
# 1. Build and install
pnpm run install:local

# 2. Reload Cursor (Cmd+Q, reopen)

# 3. Test the installed extension
```

### Preparing for Release
```bash
# 1. Ensure everything is clean
pnpm run clean

# 2. Run full quality checks
pnpm run check-types
pnpm run lint
pnpm run test

# 3. Build production bundle
pnpm run bundle

# 4. Test the .vsix before sharing
pnpm run install:local
```

### Quick Reinstall After Changes
```bash
# One command to rebuild and reinstall
pnpm run reinstall
```

---

## 📝 Notes

- **F5 Debugging**: Preferred method during development
  - No installation needed
  - Live reload with Cmd+R
  - Access to Debug Console logs

- **Local Installation**: For testing "production" behavior
  - Extension loads on Cursor startup
  - Tests the full packaged experience
  - Requires Cursor reload to see changes

- **Publisher ID**: Currently `jasonbenn` (update in `package.json` if needed)

- **Version Bumping**: Update `version` in `package.json` before running `bundle`
