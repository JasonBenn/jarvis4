#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Jarvis Worldview
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon 🤖
# @raycast.packageName Jarvis

# Open Cursor with Neighborhood Notes directory and run Readwise extension

NOTES_DIR="$HOME/notes/Neighborhood\ Notes"

# Open Cursor with the directory in a new window and execute the Readwise command
cursor -n "$NOTES_DIR"

# Wait for Cursor to open, then execute the command and open Compose
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
        delay 0.5
        -- Open Command Palette (Cmd+Shift+P)
        keystroke "p" using {shift down, command down}
        delay 0.5
        -- Type the command name
        keystroke "Readwise: Fetch and Show Highlights"
        delay 0.3
        -- Execute the command
        keystroke return
        delay 1
        -- Open Compose (Cmd+I)
        keystroke "i" using {command down}
    end tell
end tell
EOF
