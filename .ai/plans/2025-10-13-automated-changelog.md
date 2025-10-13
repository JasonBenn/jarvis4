# Automated Changelog System

## Overview

Automated changelog feature that tracks changes to markdown notes and compiles them into a Recent Changes document. Implemented in TypeScript with type safety.

## Implementation

**File**: `scripts/recent-changes.ts`
**Command**: `pnpm run recent-changes`

## Behavior

### Step 1: Git Diff Processing

Scans all changed markdown files in the git diff and adds changelog entries:

1. **Add Changelog Section**: If file doesn't have `## Changelog`, adds it
2. **Add Created Entry**: If file has no journal entries, adds:
   ```markdown
   ### [[YYYY-MM-DD]] Created: {pithy phrase hinting at core thesis}
   ```
3. **Add Updated Entry**: If file has a Created entry with a different date than today, adds:
   ```markdown
   ### [[YYYY-MM-DD]] Updated: {pithy phrase describing the change}
   ```

### Step 2: Compile Recent Changes.md

Generates `/Users/jasonbenn/notes/Neighborhood Notes/Published/Recent changes.md` with:

#### Question Entries (Unchanged)
Log entries with `#Question` in the title are copied in full with existing Readwise-optimized format

#### Created/Updated Entries (New Format)
Grouped by date with this structure:

```markdown
### [[YYYY-MM-DD]] {pithy title capturing core updates, <15 words}
- Created [[note-name]]: {pithy phrase from changelog}
- Updated [[note-name]]: {pithy phrase from changelog}
```

## Technical Details

### Types
- `LogEntry`: Represents a single changelog entry with date, type (question/created/updated), and content
- `GroupedEntry`: Groups created/updated entries by date for compilation

### Key Functions
- `processGitDiff()`: Scans git diff and adds changelog entries to files
- `addChangelogEntry()`: Adds or updates changelog section in a file
- `extractLogEntries()`: Parses changelog entries from markdown files
- `groupEntriesByDate()`: Groups created/updated entries by date
- `generatePithyPhrase()`: Generates descriptive phrases for changelog entries

### Directories
- Published: `/Users/jasonbenn/notes/Neighborhood Notes/Published`
- Private: `/Users/jasonbenn/notes/Neighborhood Notes/Private`
- Both are scanned for changelog entries

## Migration Notes

- Converted from `scripts/recent-changes.js` to TypeScript
- Execution changed from `node` to `tsx` in package.json
- Added git diff processing step
- Changed output format for Created/Updated entries to grouped format
