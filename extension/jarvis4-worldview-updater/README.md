# Jarvis4 Worldview Updater

A VS Code extension that integrates Readwise highlights into the Cursor Compose workflow for worldview updates.

## Features

- **Fetch Readwise Highlights**: Automatically fetch your latest highlights from Readwise
- **Interactive Panel**: Review highlights with keyboard-driven navigation
- **Smart State Tracking**: Track which highlights are new, integrated, archived, or snoozed
- **Snooze Functionality**: Temporarily hide highlights and have them resurface after a configurable duration
- **Compose Integration**: Seamlessly paste highlights into Cursor Compose for worldview updates

## Requirements

- A Readwise account with an API token
- Cursor IDE (for Compose integration)

## Extension Settings

This extension contributes the following settings:

- `readwise.apiToken`: Your Readwise API token (required)
- `readwise.snoozeDurationWeeks`: Number of weeks to snooze a highlight (default: 4)

## Usage

1. Set your Readwise API token in VS Code settings
2. Run the command "Readwise: Fetch and Show Highlights"
3. Use keyboard shortcuts to navigate and manage highlights:
   - **↑/↓**: Navigate between highlights
   - **Space**: Expand/collapse highlight text
   - **Enter**: Integrate highlight into worldview (paste to Compose)
   - **S**: Snooze highlight
   - **Backspace**: Archive highlight

## Database

The extension stores highlight state in a SQLite database located at:
- `{workspace}/db/readwise-highlights.db` (if in a workspace)
- VS Code global storage (fallback)

## Release Notes

### 0.1.0

Initial release of Jarvis4 Worldview Updater
