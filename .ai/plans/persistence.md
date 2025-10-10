# SQLite Persistence Implementation Plan
## VS Code Extension: Jarvis4 Worldview Updater

---

## Executive Summary

This plan outlines the implementation of SQLite persistence for the Jarvis4 Worldview Updater VS Code extension. Currently, the extension uses an in-memory data store that loses all state on restart. This implementation will add durable storage using **sql.js** (WebAssembly-based SQLite) to persist highlight states, snooze information, and sync timestamps across VS Code sessions.

**Key Decision**: Use **sql.js** over better-sqlite3 due to:
- No native module compilation issues
- Cross-platform compatibility (WASM runs anywhere)
- Official recommendation from VS Code maintainers
- Zero user configuration required

---

## Current State Analysis

### Architecture Overview

**File: `extension/jarvis4-worldview-updater/src/database.ts`**

The `HighlightDatabase` class currently maintains an in-memory `Map<string, HighlightState>` with the following interface:

```typescript
interface HighlightState {
  id: string;
  status: 'NEW' | 'INTEGRATED' | 'ARCHIVED';
  snooze_history: string | null;  // JSON array of ISO dates
  next_show_date: string | null;  // ISO date
  first_seen: string;             // ISO date
  last_updated: string;           // ISO date
}
```

**Key Methods**:
- `initialize()`: No-op (needs implementation)
- `getVisibleHighlightIds()`: Returns IDs with status='NEW' and not snoozed
- `getHighlightState(id)`: Retrieves state for a highlight
- `trackHighlight(id)`: Creates new highlight with status='NEW'
- `updateStatus(id, status)`: Marks as INTEGRATED or ARCHIVED
- `snoozeHighlight(id, durationWeeks)`: Sets next_show_date
- `getSnoozeCount(id)`: Parses snooze_history JSON
- `dispose()`: Cleanup (needs implementation)

### Data Flow

1. **Command**: `readwise.fetchAndShow` triggered
2. **Fetch**: `ReadwiseClient.fetchAllHighlightsWithBooks(lastFetch)` gets highlights from Readwise API
3. **Store**: `WebviewManager.setHighlights()` stores raw highlight data in-memory
4. **Track**: `HighlightDatabase.trackHighlight(id)` creates state records for new highlights
5. **Filter**: `getVisibleHighlightIds()` determines which highlights to show
6. **Display**: `WebviewManager.refresh()` filters and renders highlights

### Storage Location (from extension.ts:14-16)

```typescript
const dbPath = workspaceFolder
  ? path.join(workspaceFolder.uri.fsPath, 'db', 'readwise-highlights.db')
  : path.join(context.globalStorageUri.fsPath, 'readwise-highlights.db');
```

**Current behavior**: Path is determined but not used (in-memory only)

---

## Technology Decision: sql.js

### Why sql.js Over better-sqlite3?

| Criterion | sql.js | better-sqlite3 |
|-----------|--------|----------------|
| **Platform compatibility** | ✅ WASM runs everywhere | ❌ Native modules per platform |
| **VS Code compatibility** | ✅ Recommended by maintainers | ⚠️ Requires electron-rebuild |
| **User experience** | ✅ Zero configuration | ❌ May fail with version mismatches |
| **Bundle size** | ~1.5MB WASM | ~500KB but multi-platform |
| **Performance** | Good (WASM is fast) | Slightly faster (native) |
| **API complexity** | Synchronous, simple | Synchronous, simple |
| **Maintenance** | ✅ Active, official SQLite | ✅ Active community project |

### Research Findings

From VS Code discussions and GitHub issues:
- Harald Kirschner (VS Code maintainer) explicitly recommends sql.js for extensions
- @vscode/sqlite3 is NOT for extension developers (internal use only)
- better-sqlite3 requires platform-specific VSIX packages (added in VS Code 1.61)
- Multiple developers report "haven't regretted" using sql.js

**Sources**:
- https://github.com/microsoft/vscode-discussions/discussions/16
- https://github.com/WiseLibs/better-sqlite3/issues/1321
- https://stackoverflow.com/questions/76838311

---

## Implementation Plan

### Phase 1: Add sql.js Dependency

**Package Installation**:
```bash
cd extension/jarvis4-worldview-updater
pnpm add sql.js
pnpm add -D @types/sql.js
```

**Build Configuration** (esbuild.js):
- Copy `sql-wasm.wasm` from node_modules to dist/
- Ensure WASM file is included in VSIX package
- Update `.vscodeignore` to NOT exclude `dist/*.wasm`

### Phase 2: Database Schema

**SQLite DDL**:
```sql
-- Highlight state tracking
CREATE TABLE IF NOT EXISTS highlight_states (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('NEW', 'INTEGRATED', 'ARCHIVED')),
  snooze_history TEXT,        -- JSON array: ["2025-01-01T00:00:00.000Z", ...]
  next_show_date TEXT,         -- ISO 8601 date: "2025-02-01T00:00:00.000Z"
  first_seen TEXT NOT NULL,    -- ISO 8601 date
  last_updated TEXT NOT NULL   -- ISO 8601 date
);

-- Sync metadata
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_status ON highlight_states(status);
CREATE INDEX IF NOT EXISTS idx_next_show_date ON highlight_states(next_show_date);
```

**Metadata Keys**:
- `lastReadwiseFetch`: ISO date of last successful API fetch
- `dbVersion`: Schema version for migrations

### Phase 3: Rewrite HighlightDatabase Class

**New Implementation** (`database.ts`):

```typescript
import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';

export class HighlightDatabase {
  private db: Database | null = null;
  private sqlJs: any = null;

  constructor(private dbPath: string) {}

  async initialize(): Promise<void> {
    // Initialize sql.js WASM module
    this.sqlJs = await initSqlJs({
      locateFile: (file) => {
        // In VS Code extension, WASM file is in dist/
        return path.join(__dirname, file);
      }
    });

    // Load existing database or create new
    let data: Uint8Array | undefined;
    try {
      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        data = new Uint8Array(buffer);
      }
    } catch (err) {
      console.warn('Could not load existing database:', err);
    }

    this.db = new this.sqlJs.Database(data);

    // Create schema
    this.db.run(`
      CREATE TABLE IF NOT EXISTS highlight_states (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK(status IN ('NEW', 'INTEGRATED', 'ARCHIVED')),
        snooze_history TEXT,
        next_show_date TEXT,
        first_seen TEXT NOT NULL,
        last_updated TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_status ON highlight_states(status);
      CREATE INDEX IF NOT EXISTS idx_next_show_date ON highlight_states(next_show_date);
    `);

    console.log('Database initialized:', this.dbPath);
  }

  getVisibleHighlightIds(): string[] {
    if (!this.db) return [];

    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT id FROM highlight_states
      WHERE status = 'NEW'
        AND (next_show_date IS NULL OR next_show_date <= ?)
    `);

    stmt.bind([now]);
    const ids: string[] = [];
    while (stmt.step()) {
      ids.push(stmt.get()[0] as string);
    }
    stmt.free();

    return ids;
  }

  getHighlightState(id: string): HighlightState | null {
    if (!this.db) return null;

    const stmt = this.db.prepare(`
      SELECT * FROM highlight_states WHERE id = ?
    `);
    stmt.bind([id]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row as HighlightState;
    }

    stmt.free();
    return null;
  }

  trackHighlight(id: string): void {
    if (!this.db) return;

    const now = new Date().toISOString();
    this.db.run(`
      INSERT OR IGNORE INTO highlight_states
      (id, status, snooze_history, next_show_date, first_seen, last_updated)
      VALUES (?, 'NEW', NULL, NULL, ?, ?)
    `, [id, now, now]);

    this.save();
  }

  updateStatus(id: string, status: 'INTEGRATED' | 'ARCHIVED'): void {
    if (!this.db) return;

    const now = new Date().toISOString();
    this.db.run(`
      UPDATE highlight_states
      SET status = ?, last_updated = ?
      WHERE id = ?
    `, [status, now, id]);

    this.save();
  }

  snoozeHighlight(id: string, durationWeeks: number = 4): void {
    if (!this.db) return;

    const state = this.getHighlightState(id);
    if (!state) return;

    const now = new Date().toISOString();
    const snoozeHistory = state.snooze_history
      ? JSON.parse(state.snooze_history)
      : [];
    snoozeHistory.push(now);

    const nextShowDate = new Date();
    nextShowDate.setDate(nextShowDate.getDate() + (durationWeeks * 7));

    this.db.run(`
      UPDATE highlight_states
      SET snooze_history = ?, next_show_date = ?, last_updated = ?
      WHERE id = ?
    `, [JSON.stringify(snoozeHistory), nextShowDate.toISOString(), now, id]);

    this.save();
  }

  getSnoozeCount(id: string): number {
    const state = this.getHighlightState(id);
    if (!state || !state.snooze_history) return 0;

    try {
      const history = JSON.parse(state.snooze_history as string);
      return Array.isArray(history) ? history.length : 0;
    } catch {
      return 0;
    }
  }

  // Metadata operations
  getLastReadwiseFetch(): string | null {
    return this.getMetadata('lastReadwiseFetch');
  }

  setLastReadwiseFetch(date: string): void {
    this.setMetadata('lastReadwiseFetch', date);
  }

  private getMetadata(key: string): string | null {
    if (!this.db) return null;

    const stmt = this.db.prepare('SELECT value FROM metadata WHERE key = ?');
    stmt.bind([key]);

    if (stmt.step()) {
      const value = stmt.get()[0] as string;
      stmt.free();
      return value;
    }

    stmt.free();
    return null;
  }

  private setMetadata(key: string, value: string): void {
    if (!this.db) return;

    const now = new Date().toISOString();
    this.db.run(`
      INSERT OR REPLACE INTO metadata (key, value, updated_at)
      VALUES (?, ?, ?)
    `, [key, value, now]);

    this.save();
  }

  private save(): void {
    if (!this.db) return;

    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (err) {
      console.error('Failed to save database:', err);
    }
  }

  dispose(): void {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
    }
  }
}
```

### Phase 4: Update Extension Activation

**Changes to `extension.ts`**:

```typescript
export async function activate(context: vscode.ExtensionContext) {
  try {
    console.log('Activating Jarvis4 Worldview Updater extension...');

    // CHANGE: Use globalStorageUri (workspace-agnostic)
    const storagePath = context.globalStorageUri.fsPath;
    const dbPath = path.join(storagePath, 'readwise-highlights.db');

    console.log('Database path:', dbPath);

    const db = new HighlightDatabase(dbPath);
    await db.initialize();  // CHANGE: Now async

    // Rest remains the same...
  }
}
```

**Changes to `commands.ts`**:

```typescript
// Line 21-25: Use persistent lastReadwiseFetch
const lastFetch = db.getLastReadwiseFetch();
const updatedAfter = lastFetch || (() => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return thirtyDaysAgo.toISOString();
})();

// After successful fetch (line 46):
db.setLastReadwiseFetch(new Date().toISOString());
```

### Phase 5: Update Build Configuration

**esbuild.js** additions:

```javascript
const fs = require('fs');
const path = require('path');

// After build completes, copy WASM file
const wasmSource = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const wasmDest = path.join(__dirname, 'dist', 'sql-wasm.wasm');

if (fs.existsSync(wasmSource)) {
  fs.copyFileSync(wasmSource, wasmDest);
  console.log('Copied sql-wasm.wasm to dist/');
}
```

**.vscodeignore** update:
```
# Remove this line if present:
# dist/*.wasm

# Or explicitly include:
!dist/sql-wasm.wasm
```

---

## Testing Strategy: CLI Test Harness for Agentic Loop

### Goal

Create a standalone Node.js test script that exercises the database independently of VS Code, enabling rapid iteration in an agentic loop until persistence is fully working.

### Test Script: `extension/jarvis4-worldview-updater/test-persistence.js`

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { HighlightDatabase } = require('./dist/database');

const TEST_DB_PATH = path.join(__dirname, '.test-db', 'test.db');
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(color, ...args) {
  console.log(color + args.join(' ') + COLORS.reset);
}

function assert(condition, message) {
  if (!condition) {
    log(COLORS.red, '❌ FAIL:', message);
    process.exit(1);
  }
  log(COLORS.green, '✅ PASS:', message);
}

async function runTests() {
  log(COLORS.blue, '\n🧪 Testing SQLite Persistence\n');

  // Test 1: Fresh database creation
  log(COLORS.yellow, '📝 Test 1: Create fresh database');
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const db1 = new HighlightDatabase(TEST_DB_PATH);
  await db1.initialize();
  assert(fs.existsSync(TEST_DB_PATH), 'Database file created');

  // Test 2: Track highlights
  log(COLORS.yellow, '\n📝 Test 2: Track highlights');
  db1.trackHighlight('highlight-001');
  db1.trackHighlight('highlight-002');
  db1.trackHighlight('highlight-003');

  const visible1 = db1.getVisibleHighlightIds();
  assert(visible1.length === 3, `Should have 3 NEW highlights (got ${visible1.length})`);

  // Test 3: Update status
  log(COLORS.yellow, '\n📝 Test 3: Update highlight status');
  db1.updateStatus('highlight-001', 'INTEGRATED');
  const visible2 = db1.getVisibleHighlightIds();
  assert(visible2.length === 2, `Should have 2 NEW highlights after integration (got ${visible2.length})`);

  // Test 4: Snooze functionality
  log(COLORS.yellow, '\n📝 Test 4: Snooze highlight');
  db1.snoozeHighlight('highlight-002', 4);
  const snoozeCount = db1.getSnoozeCount('highlight-002');
  assert(snoozeCount === 1, `Should have 1 snooze (got ${snoozeCount})`);

  const visible3 = db1.getVisibleHighlightIds();
  assert(visible3.length === 1, `Should have 1 visible after snooze (got ${visible3.length})`);

  // Test 5: Metadata operations
  log(COLORS.yellow, '\n📝 Test 5: Metadata persistence');
  const testDate = '2025-01-15T10:30:00.000Z';
  db1.setLastReadwiseFetch(testDate);
  const fetchedDate = db1.getLastReadwiseFetch();
  assert(fetchedDate === testDate, `Last fetch date should persist (got ${fetchedDate})`);

  // Test 6: Close and reopen - PERSISTENCE TEST
  log(COLORS.yellow, '\n📝 Test 6: Persistence across sessions (CRITICAL)');
  db1.dispose();

  const db2 = new HighlightDatabase(TEST_DB_PATH);
  await db2.initialize();

  const visible4 = db2.getVisibleHighlightIds();
  assert(visible4.length === 1, `Should still have 1 visible after restart (got ${visible4.length})`);

  const state = db2.getHighlightState('highlight-001');
  assert(state?.status === 'INTEGRATED', `Status should persist (got ${state?.status})`);

  const fetchedDate2 = db2.getLastReadwiseFetch();
  assert(fetchedDate2 === testDate, `Metadata should persist (got ${fetchedDate2})`);

  const snoozeCount2 = db2.getSnoozeCount('highlight-002');
  assert(snoozeCount2 === 1, `Snooze count should persist (got ${snoozeCount2})`);

  // Test 7: Snooze expiration
  log(COLORS.yellow, '\n📝 Test 7: Snooze expiration (past date)');
  db2.trackHighlight('highlight-004');
  // Manually set past snooze date via direct SQL (hack for testing)
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 7);
  const stmt = db2.db.prepare(`
    UPDATE highlight_states
    SET next_show_date = ?
    WHERE id = ?
  `);
  stmt.run([pastDate.toISOString(), 'highlight-004']);
  stmt.free();
  db2.save(); // Force save

  const visible5 = db2.getVisibleHighlightIds();
  assert(visible5.includes('highlight-004'), `Expired snooze should be visible`);

  // Cleanup
  db2.dispose();
  log(COLORS.green, '\n✨ All tests passed!\n');

  // Show database info
  const stats = fs.statSync(TEST_DB_PATH);
  log(COLORS.blue, `📊 Database size: ${stats.size} bytes`);
  log(COLORS.blue, `📁 Database path: ${TEST_DB_PATH}`);
}

// Run tests
runTests().catch(err => {
  log(COLORS.red, '\n💥 Test error:', err);
  process.exit(1);
});
```

### Running the Test in Agentic Loop

**Add to package.json scripts**:
```json
{
  "scripts": {
    "test:persistence": "node test-persistence.js",
    "watch:test": "nodemon --watch src --watch dist --exec 'pnpm run build && pnpm run test:persistence'"
  }
}
```

**Agentic Loop Workflow**:

1. **Initial Run**:
   ```bash
   cd extension/jarvis4-worldview-updater
   pnpm run build
   pnpm run test:persistence
   ```

2. **Iterate**:
   - Test fails → identify issue from error message
   - Fix code in `src/database.ts`
   - Rebuild and retest: `pnpm run build && pnpm run test:persistence`
   - Repeat until all tests pass

3. **Watch Mode** (for rapid iteration):
   ```bash
   pnpm run watch:test
   ```

### Success Criteria for Tests

- ✅ Database file created at specified path
- ✅ Schema tables exist (highlight_states, metadata)
- ✅ Can insert and retrieve highlight states
- ✅ Status updates persist
- ✅ Snooze history and dates persist
- ✅ Metadata (lastReadwiseFetch) persists
- ✅ **CRITICAL**: Data survives database close/reopen cycle
- ✅ Visible highlights filtered correctly (status + snooze date)
- ✅ File size is reasonable (&lt;100KB for small dataset)

---

## Integration Testing in VS Code

After CLI tests pass, test in actual VS Code:

### Manual Test Steps

1. **Clean Install**:
   ```bash
   cd extension/jarvis4-worldview-updater
   pnpm run reinstall
   ```

2. **First Session**:
   - Open VS Code
   - Run command: "Readwise: Fetch and Show Highlights"
   - Verify highlights appear
   - Integrate or snooze some highlights
   - Close VS Code

3. **Second Session** (persistence verification):
   - Reopen VS Code
   - Check database location:
     - macOS: `~/Library/Application Support/Cursor/User/globalStorage/jasonbenn.jarvis4-worldview-updater/readwise-highlights.db`
   - Run command: "Readwise: Show Highlights Panel"
   - **Expected**: Previously integrated/snoozed highlights should NOT reappear
   - Run command: "Readwise: Fetch and Show Highlights"
   - **Expected**: Should fetch only NEW highlights since last fetch

4. **Verify Database File**:
   ```bash
   # Install SQLite CLI if needed: brew install sqlite
   sqlite3 ~/Library/Application\ Support/Cursor/User/globalStorage/jasonbenn.jarvis4-worldview-updater/readwise-highlights.db
   ```
   ```sql
   .tables
   SELECT COUNT(*) FROM highlight_states;
   SELECT * FROM metadata;
   .exit
   ```

---

## Implementation Checklist

### Development Phase

- [ ] Install sql.js dependency
- [ ] Copy WASM file in build process
- [ ] Update .vscodeignore to include WASM
- [ ] Rewrite HighlightDatabase class with sql.js
- [ ] Add metadata table and methods
- [ ] Make initialize() async and update callers
- [ ] Update extension.ts to use globalStorageUri
- [ ] Update commands.ts to use persistent lastReadwiseFetch
- [ ] Create test-persistence.js script
- [ ] Run CLI tests until all pass
- [ ] Test in VS Code dev environment
- [ ] Verify data persists across VS Code restarts

### Quality Assurance

- [ ] Test with no existing database (first run)
- [ ] Test with corrupted database file (error handling)
- [ ] Test with read-only storage directory (permission errors)
- [ ] Test rapid open/close cycles (no data loss)
- [ ] Test with 1000+ highlights (performance)
- [ ] Test snooze date boundary conditions
- [ ] Test JSON parse errors in snooze_history

### Documentation

- [ ] Update README.md with persistence information
- [ ] Document database location in COMMANDS.md
- [ ] Add troubleshooting section for database issues
- [ ] Update CHANGELOG.md

---

## Potential Issues and Solutions

### Issue 1: WASM File Not Found

**Symptom**: `Error: Could not locate sql-wasm.wasm`

**Solutions**:
- Check esbuild.js copies file to dist/
- Verify .vscodeignore doesn't exclude .wasm
- Use absolute path in locateFile: `path.join(__dirname, 'sql-wasm.wasm')`

### Issue 2: Database Directory Doesn't Exist

**Symptom**: `ENOENT: no such file or directory`

**Solution**: Create directory recursively before writing:
```typescript
const dir = path.dirname(this.dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
```

### Issue 3: Async Initialization Not Awaited

**Symptom**: Methods called before database is ready

**Solution**: Ensure all paths await `db.initialize()`:
- extension.ts line 21: `await db.initialize()`
- Any tests must await initialization

### Issue 4: Save Performance on Every Write

**Symptom**: Extension feels slow

**Solutions**:
- Debounce saves (write after 500ms idle)
- Only save on dispose() + periodic checkpoint
- Use transactions for batch operations

### Issue 5: Large Database File Size

**Symptom**: Database grows unexpectedly

**Solutions**:
- Run `VACUUM` periodically to reclaim space
- Archive old INTEGRATED/ARCHIVED highlights (move to archive table)
- Add retention policy (delete after 6 months)

---

## Future Enhancements

### Phase 2 Features (Post-MVP)

1. **Database Migration System**:
   - Track schema version in metadata
   - Write migration functions for schema changes
   - Auto-migrate on version mismatch

2. **Backup and Export**:
   - Command to export highlights to JSON
   - Automatic backup before migrations
   - Cloud sync via VS Code settings sync

3. **Performance Optimization**:
   - Add prepared statement caching
   - Use transactions for batch operations
   - Implement connection pooling (if needed)

4. **Advanced Queries**:
   - Full-text search on highlight text
   - Tag-based filtering
   - Date range queries
   - Statistics dashboard

5. **Data Cleanup**:
   - Archive highlights older than X months
   - Command to reset database
   - Vacuum command to optimize storage

---

## References

### Documentation

- **sql.js GitHub**: https://github.com/sql-js/sql.js
- **sql.js NPM**: https://www.npmjs.com/package/sql.js
- **VS Code Extension API**: https://code.visualstudio.com/api/references/vscode-api
- **VS Code Storage**: https://code.visualstudio.com/api/extension-capabilities/common-capabilities

### Research Sources

- VS Code Discussions #16: "Easiest way to use sqlite in vscode extension"
- better-sqlite3 Issue #1321: "Unable to integrate with Electron (Vscode extension)"
- Stack Overflow: "Can I build a VS Code extension that uses sqlite that works on all platforms?"
- VS Code Blog (May 2024): "Using WebAssembly for Extension Development"

### Example Extensions Using sql.js

- vscode-sqlite (alexcvzz): SQLite database viewer
- vscode-sqlite3-editor (yy0931): Interactive SQLite editor

---

## Agentic Loop: Quick Start Guide

**For Claude/AI Agent implementing this plan**:

1. **Start Here**: Read this entire plan first
2. **Install Dependencies**: `pnpm add sql.js && pnpm add -D @types/sql.js`
3. **Implement Database**: Rewrite `src/database.ts` using sql.js code from Phase 3
4. **Build Configuration**: Update `esbuild.js` to copy WASM file
5. **Create Test**: Write `test-persistence.js` from Testing Strategy section
6. **Iterate**:
   ```bash
   pnpm run build && node test-persistence.js
   ```
7. **Fix Errors**: Test output will show specific failures
8. **Repeat**: Until all tests pass
9. **Integration**: Test in VS Code with `pnpm run reinstall`

**Key Success Metric**: Test 6 (persistence across sessions) must pass - this proves data survives restarts.

---

## Conclusion

This plan provides a complete roadmap for adding SQLite persistence to the Jarvis4 Worldview Updater extension. The combination of:

- **sql.js** for cross-platform compatibility
- **CLI test harness** for rapid iteration
- **Agentic loop workflow** for systematic debugging

...ensures a smooth implementation with high confidence in the final result.

**Estimated Implementation Time**: 4-6 hours with iterative testing

**Risk Level**: Low (sql.js is battle-tested, CLI tests catch issues early)

**Next Step**: Begin Phase 1 - Add sql.js dependency
