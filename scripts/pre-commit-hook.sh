#!/usr/bin/env bash
# Git pre-commit hook for Neighborhood Notes
# This generates Recent changes.md and uploads it to Readwise

set -e  # Exit on error

echo "🔄 Generating Recent changes.md..."
node "$HOME/code/jarvis4/scripts/recent-changes.js"

echo "📤 Uploading to Readwise..."
cd "$HOME/code/jarvis4"
pnpm upload

echo "✅ Pre-commit hook complete!"

