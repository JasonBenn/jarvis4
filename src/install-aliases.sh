#!/bin/bash

# Install both worldview-upload and worldview-update aliases

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BASH_PROFILE="$HOME/.bash_profile"

# Remove old aliases if they exist
sed -i.bak '/alias worldview-upload=/d' "$BASH_PROFILE" 2>/dev/null || true
sed -i.bak '/alias worldview-update=/d' "$BASH_PROFILE" 2>/dev/null || true

# Add both aliases
echo "alias worldview-upload='cd $PROJECT_DIR && pnpm upload'" >> "$BASH_PROFILE"
echo "alias worldview-update='$PROJECT_DIR/src/worldview-update.sh'" >> "$BASH_PROFILE"
source ~/.bash_profile

echo "✅ Aliases installed!"
echo "  - worldview-upload (upload to Readwise)"
echo "  - worldview-update (open Cursor)"