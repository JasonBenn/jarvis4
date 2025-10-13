#!/usr/bin/env bash
# Git pre-commit hook for Neighborhood Notes
# This generates Recent changes.md and uploads it to Readwise

set -e  # Exit on error

cd "$HOME/code/jarvis4"

echo "🔄 Generating Recent changes.md..."
pnpm tsx scripts/recent-changes.ts

echo "📤 Uploading to Readwise..."
pnpm upload

echo "✅ Pre-commit hook complete!"

