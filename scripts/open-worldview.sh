#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Jarvis Worldview
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🤖
# @raycast.packageName Jarvis

# Open Cursor with Neighborhood Notes directory and run Readwise extension

NOTES_DIR="$HOME/notes/Neighborhood\ Notes"
BACKEND_URL="http://127.0.0.1:3456"

# Check if backend is running
if ! curl -s -f "${BACKEND_URL}/health" > /dev/null 2>&1; then
    echo "Starting Jarvis4 backend..."
    launchctl start com.jasonbenn.jarvis4-backend

    # Wait for backend to be ready (max 10 seconds)
    for i in {1..20}; do
        if curl -s -f "${BACKEND_URL}/health" > /dev/null 2>&1; then
            echo "Backend is ready!"
            break
        fi
        sleep 0.5
    done

    # Check if backend started successfully
    if ! curl -s -f "${BACKEND_URL}/health" > /dev/null 2>&1; then
        echo "Error: Backend failed to start. Check logs with: tail -f ~/code/jarvis4/logs/backend.log"
        exit 1
    fi
fi

# Open Cursor with the directory in a new window and execute the Readwise command
cursor -n "$NOTES_DIR" &

# Wait for Cursor to be running
sleep 3

# Wait for Cursor to open, then execute the command and open Compose
osascript <<EOF
tell application "Cursor"
    activate
    delay 3
    tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        if frontApp is not "Cursor" then
            tell process "Cursor"
                -- Toggle focus to bring Cursor to front (Cmd+Shift+Option+P)
                keystroke "p" using {shift down, option down, command down}
                delay 0.3
            end tell
        end if
    end tell
    tell application "System Events" to tell process "Cursor"
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
