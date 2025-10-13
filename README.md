# Jarvis: collaboratively updating your worldview to integrate what you read

I'm frustrated that I can read something profound and then forget 95% of it within a month.

This project is a Cursor plugin that allows me to view and select my Readwise highlights, and then collaborate with AI to integrate them into a [wiki of the ways I've changed my mind recently](https://neighborhoodsf.com/Neighborhood+Notes/Published/Recent+changes)).

This process often surfaces great questions. Jarvis will also take my great questions and find 10 high quality links for to read to dive into that question more deeply. Then these are all compiled into a [changelog](https://neighborhoodsf.com/Neighborhood+Notes/Published/Recent+changes), uploaded into Readwise, and pinned to the top of my Readwise home screen.

My overall flow is to open Readwise when I want to read in the evenings, read my changelog and dive deep into the questions I'm most curious about, and make highlights and notes. Then I sleep on it. In the morning, if I'm feeling inspired, I'll open Jarvis for some morning pages, select highlights on topics I'm thinking about, maybe press E to search for more relevant highlights along those lines, push ENTER to compile them into a prompt for Cursor Compose, and then collaboratively update my wiki with Cursor. Usually that'll surface more questions, which I'll note down. When I commit my changes, the questions are automatically fleshed out with excellent relevant resources, compiled into a changelog, and uploaded into my Readwise, closing the loop.

The prompt is modeled after Claude Code's system and tools prompts and has several sections:
- Notice interesting tensions in my wiki. Can you spot any existing content where the idea(s) of this note conflict?
- What great [thought partnership](https://github.com/JasonBenn/jarvis4/blob/main/prompts/worldview.md#on-great-thought-partnership) looks like
- What makes a great [evergreen note](https://github.com/JasonBenn/jarvis4/blob/main/prompts/worldview.md#evergreen-notes-should-be-atomic), copied from Andy Matuschak's [inspiring notes](https://notes.andymatuschak.org/About_these_notes?stackedNotes=z5E5QawiXCMbtNtupvxeoEX)
- How to update changelogs
- And an algorithm for [sourcing great resources for my questions](https://github.com/JasonBenn/jarvis4/blob/main/prompts/worldview.md#question-sourcing-mode)

I use it for intellectual topics, of course:
<img width="1728" height="1117" alt="Screenshot 2025-10-13 at 11 14 21 AM" src="https://github.com/user-attachments/assets/e28a409b-6995-4f81-97d4-1b9533a9c704" />

But I also use it to reflect on living my best life:
<img width="1728" height="1117" alt="Screenshot 2025-10-13 at 11 03 56 AM" src="https://github.com/user-attachments/assets/e07fff75-2913-4efb-9c91-c1493248893a" />

## Components

### VS Code Extension

Browse and integrate Readwise highlights directly in Cursor.

**Location**: `extension/jarvis4-worldview-updater/`

**Features**:
- Fetch highlights from Readwise API
- Keyboard-driven navigation (↑/↓, SPACE, ENTER, S, BACKSPACE)
- Multi-select and bulk operations
- Snooze highlights (reappear after 4 weeks)
- Archive unwanted highlights
- Semantic search with `/` or `E` keys
- Two-pane layout with infinite scroll
- Grouped list view by book

**Commands**:
- `Readwise: Fetch and Show Highlights` - Fetch new highlights and show panel


### Automated Changelog System

Tracks wiki changes and compiles them into a changelog with AI-generated summaries and curated reading lists.

**Location**: `scripts/recent-changes.ts`

**Behavior**:
1. Scans git diff for changed markdown files
2. Adds `## Changelog` sections with dated entries
3. Compiles changelog entries into `Recent changes.md`
4. Extracts questions from changelog entries
5. For each question, finds 10 high-quality links using AI
6. Uploads changelog to Readwise (pinned to home screen)

**Run**:
```bash
pnpm run recent-changes
```

**Pre-commit Hook**: Automatically runs on commit to update changelog

## Installation

### Prerequisites
- Cursor CLI installed (should be available as `cursor` command)
- Node.js and pnpm
- Readwise API token

### Setup

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Initialize databases**:
   ```bash
   pnpm run db:init  # Initialize image tracking database
   ```

3. **Install command aliases**:
   ```bash
   pnpm run install-alias
   source ~/.bash_profile
   ```

4. **Install VS Code extension**:
   ```bash
   cd extension/jarvis4-worldview-updater
   pnpm run reinstall
   ```

5. **Start backend service** (macOS):
   ```bash
   pnpm backend:load    # Load launchd service (auto-start on login)
   pnpm backend:start   # Start service now
   ```

6. **Configure Readwise API token**:
   - Open Cursor settings
   - Search for "readwise.apiToken"
   - Paste your token from https://readwise.io/access_token

## Development

### Debug VS Code extension
1. Open `extension/jarvis4-worldview-updater` in Cursor and make changes
2. Run `pnpm reinstall`
3. In another Cursor window, run `Reload Window` from the command palette and then `Readwise: Fetch and Show Highlights`
