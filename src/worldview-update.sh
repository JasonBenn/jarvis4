#!/bin/bash

# Open Cursor with Neighborhood Notes directory and insert worldview-update prompt into Compose

NOTES_DIR="$HOME/notes/Neighborhood\ Notes"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/../prompts/worldview-update.md"

# Read the prompt content
PROMPT_CONTENT=$(cat "$PROMPT_FILE")

# Open Cursor with the directory in a new window
cursor -n "$NOTES_DIR"

# Wait for Cursor to open, then make it maximized and insert prompt content
osascript <<EOF
tell application "Cursor"
    activate
    delay 2
    tell application "System Events" to tell process "Cursor"
        -- Toggle focus (Cmd+Shift+Option+P)
        keystroke "p" using {shift down, option down, command down}
        delay 0.3
        -- Make window maximized (Cmd+Option+F)
        keystroke "f" using {option down, command down}
        delay 0.3
        -- Open Compose (Cmd+I)
        keystroke "i" using {command down}
        delay 0.5
        -- Paste the prompt content
        set the clipboard to "$(echo "$PROMPT_CONTENT" | sed 's/"/\\"/g')"
        keystroke "v" using {command down}
    end tell
end tell
EOF
