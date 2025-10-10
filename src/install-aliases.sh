#!/bin/bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BASH_PROFILE="$HOME/.bash_profile"

# Remove old aliases if they exist
sed -i.bak '/alias worldview=/d' "$BASH_PROFILE" 2>/dev/null || true
echo "alias worldview='$PROJECT_DIR/src/worldview.sh'" >> "$BASH_PROFILE"
source ~/.bash_profile
echo "✅ Aliases installed!"