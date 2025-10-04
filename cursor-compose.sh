#!/bin/bash

# Open Cursor with Neighborhood Notes directory and insert @prompts/worldview-update.md into Compose

NOTES_DIR="$HOME/notes/Neighborhood Notes"

# Open Cursor with the directory in a new window
cursor -n "$NOTES_DIR"

# Wait for Cursor to open, then make it fullscreen and insert @prompts reference
osascript <<'EOF'
tell application "Cursor"
    activate
    delay 1
    tell application "System Events"
        -- Make window fullscreen (Ctrl+Cmd+F)
        keystroke "f" using {control down, command down}
        delay 0.3
        -- Open Compose (Cmd+L)
        keystroke "l" using {command down}
        delay 0.5
        keystroke "@prompts/worldview-update.md "
    end tell
end tell
EOF
