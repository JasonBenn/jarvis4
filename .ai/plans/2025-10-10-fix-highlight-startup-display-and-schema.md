# Fix Highlight Startup Display & Schema Migration

**Date**: 2025-10-10
**Status**: Proposed

## Problem Statement

### Bug 1: No Highlights Display on Startup

The VS Code extension currently shows **zero highlights on startup**, even though:
- Database has 89 highlights (87 NEW, 2 INTEGRATED) in `highlight_states` table
- Database has 0 highlights in `highlight_data` table
- `lastReadwiseFetch` is set to `2025-10-10T22:46:11.798Z`

**Root Cause**: The `highlight_data` table is empty because:
1. Old version of code created `highlight_states` without corresponding `highlight_data` entries
2. Migration logic (database.ts:90-110) detected this and cleared `lastReadwiseFetch`
3. BUT no automatic fetch happens on extension activation
4. User must manually run `readwise.fetchAndShow` command to see anything

**Current Startup Flow**:
1. `extension.ts:activate()` runs
2. Initializes database, webview manager, registers commands
3. **Does nothing else** - no webview opened, no fetch triggered
4. Extension sits idle until user manually runs command

### Bug 2: Schema Doesn't Match Original Design

**Current Schema** (database.ts:51-77):
```sql
CREATE TABLE highlight_states (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('NEW', 'INTEGRATED', 'ARCHIVED')),
  snooze_history TEXT,
  next_show_date TEXT,
  first_seen TEXT NOT NULL,
  last_updated TEXT NOT NULL
);

CREATE TABLE highlight_data (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  highlighted_at TEXT,
  book_title TEXT NOT NULL,
  book_author TEXT
);

CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Original Spec** (.ai/plans/2025-10-05-readwise-highlights-extension-plan.md:63-82):
```sql
CREATE TABLE highlights (
  id TEXT PRIMARY KEY,
  status TEXT CHECK(status IN ('NEW', 'INTEGRATED', 'ARCHIVED')) DEFAULT 'NEW',
  snooze_history TEXT,
  next_show_date TEXT,
  first_seen TEXT NOT NULL,
  last_updated TEXT NOT NULL
);
```

**Key Differences**:
- ❌ Current: Split into TWO tables (`highlight_states` + `highlight_data`)
- ✅ Spec: Single `highlights` table with minimal state tracking
- ❌ Current: Duplicates Readwise data (text, title, author) in local DB
- ✅ Spec: "Keep the database as a minimal state-tracking layer. All highlight content is fetched fresh from the Readwise API on each session."

**Why This Matters**:
- Original design: DB only tracks user actions (INTEGRATED, ARCHIVED, snoozed)
- All content fetched fresh from Readwise API each session
- Simpler, more maintainable, single source of truth
- Current two-table approach adds complexity without benefit

## Desired Behavior

1. **On extension activation**:
   - Immediately open webview panel
   - Show "Readwise Highlights" loading state

2. **Fetch new highlights** (from API):
   - Fetch highlights updated since `lastReadwiseFetch`
   - Store highlight IDs in database as NEW
   - Display these highlights immediately in webview

3. **In parallel, load recent highlights from DB**:
   - Query for 30 recent highlight IDs that are "due" (NEW, not snoozed, or snooze period ended)
   - Fetch their full details from Readwise API
   - Display them in webview

4. **Result**: User always sees 30+ highlights on startup without manual intervention

## Proposed Solution

### Part 1: Schema Migration

**Goal**: Migrate from current two-table design to original single-table design.

**Steps**:

1. **Update database.ts schema** to match original spec:
   ```sql
   CREATE TABLE highlights (
     id TEXT PRIMARY KEY,
     status TEXT CHECK(status IN ('NEW', 'INTEGRATED', 'ARCHIVED')) DEFAULT 'NEW',
     snooze_history TEXT,
     next_show_date TEXT,
     first_seen TEXT NOT NULL,
     last_updated TEXT NOT NULL
   );

   CREATE INDEX IF NOT EXISTS idx_status ON highlights(status);
   CREATE INDEX IF NOT EXISTS idx_next_show_date ON highlights(next_show_date);
   ```

2. **Add migration logic** in `initialize()`:
   ```typescript
   // Check if old schema exists
   const hasOldSchema = /* check for highlight_states table */;

   if (hasOldSchema) {
     // Migrate highlight_states -> highlights
     // Copy id, status, snooze_history, next_show_date, first_seen, last_updated
     // Drop highlight_states, highlight_data tables
     // Keep metadata table (still useful for lastReadwiseFetch)
   }
   ```

3. **Update HighlightDatabase methods**:
   - Remove `trackHighlight(id, data?)` - should only accept `id`
   - Remove `getRecentUnprocessedHighlights()` - no longer needed (no stored content)
   - Add method to get list of visible highlight IDs only
   - Webview will fetch full highlight details from Readwise API using those IDs

4. **Update commands.ts**:
   - `fetchAndShow` should only store highlight IDs, not full content
   - Remove `data` parameter from `db.trackHighlight()` calls

5. **Update webview.ts**:
   - `refresh()` should:
     - Get visible highlight IDs from DB
     - Fetch full highlight details from Readwise API
     - Display highlights in webview
   - This ensures content is always fresh from Readwise

### Part 2: Auto-Display on Startup

**Goal**: Automatically show highlights when extension activates.

**Changes to extension.ts**:

```typescript
export async function activate(context: vscode.ExtensionContext) {
  try {
    console.log('Activating Jarvis4 Worldview Updater extension...');

    // Initialize database
    const storagePath = context.globalStorageUri.fsPath;
    const dbPath = path.join(storagePath, 'readwise-highlights.db');
    const db = new HighlightDatabase(dbPath);
    await db.initialize();

    // Get API token from configuration
    const config = vscode.workspace.getConfiguration('readwise');
    const apiToken = config.get<string>('apiToken');

    if (!apiToken) {
      vscode.window.showWarningMessage(
        'Readwise API token not configured. Please set readwise.apiToken in your settings.',
        'Open Settings'
      ).then(selection => {
        if (selection === 'Open Settings') {
          vscode.commands.executeCommand('workbench.action.openSettings', 'readwise.apiToken');
        }
      });
      return; // Don't proceed without API token
    }

    // Initialize Readwise client
    const readwise = new ReadwiseClient(apiToken);

    // Initialize webview manager
    const webviewManager = new WebviewManager(context, db, readwise);

    // Register commands
    registerCommands(context, db, readwise, webviewManager);

    // Store in context for cleanup
    context.subscriptions.push({
      dispose: () => db.dispose()
    });

    // NEW: Auto-fetch and show on startup
    await vscode.commands.executeCommand('readwise.fetchAndShow');

    console.log('Jarvis4 Worldview Updater extension activated successfully');
  } catch (error) {
    console.error('Failed to activate Jarvis4 Worldview Updater:', error);
    vscode.window.showErrorMessage(`Failed to activate Jarvis4 Worldview Updater: ${error}`);
    throw error;
  }
}
```

**Changes to commands.ts**:

```typescript
vscode.commands.registerCommand('readwise.fetchAndShow', async () => {
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Fetching Readwise highlights...',
    cancellable: false
  }, async (progress) => {
    try {
      // Get lastReadwiseFetch from DB metadata
      const lastFetch = db.getLastReadwiseFetch() || (() => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return thirtyDaysAgo.toISOString();
      })();

      // Fetch NEW highlights from Readwise (updated since lastFetch)
      progress.report({ message: 'Downloading from Readwise...' });
      const newHighlights = await readwise.fetchAllHighlightsWithBooks(lastFetch);

      // Track new highlights in DB (ID only, no content)
      progress.report({ message: 'Processing highlights...' });
      let newCount = 0;
      for (const item of newHighlights) {
        const highlightId = String(item.highlight.id);
        const existingState = db.getHighlightState(highlightId);
        if (!existingState) {
          db.trackHighlight(highlightId); // Only store ID
          newCount++;
        }
      }

      // Update lastReadwiseFetch
      db.setLastReadwiseFetch(new Date().toISOString());

      // Show webview (will fetch full details for visible highlights from API)
      await webview.show();

      vscode.window.showInformationMessage(
        `Fetched ${newHighlights.length} highlights from Readwise (${newCount} new)`
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Error fetching highlights: ${error}`);
    }
  });
});
```

**Changes to webview.ts**:

```typescript
export class WebviewManager {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private context: vscode.ExtensionContext,
    private db: HighlightDatabase,
    private readwise: ReadwiseClient  // NEW: Need readwise client
  ) {}

  async refresh(): Promise<void> {
    if (!this.panel) {return;}

    // Get visible highlight IDs from DB (NEW, not snoozed, or snooze ended)
    const visibleIds = this.db.getVisibleHighlightIds();

    // Fetch full highlight details from Readwise API
    const allHighlights = await this.readwise.fetchAllHighlightsWithBooks();

    // Filter to only visible IDs
    const highlightsToShow = allHighlights
      .filter(item => visibleIds.includes(String(item.highlight.id)))
      .slice(0, 30)  // Limit to 30 most recent
      .map(item => {
        const snoozeCount = this.db.getSnoozeCount(String(item.highlight.id));
        return {
          id: String(item.highlight.id),
          text: item.highlight.text,
          source_title: item.book.title || 'Unknown',
          source_author: item.book.author || undefined,
          highlighted_at: item.highlight.highlighted_at || undefined,
          snooze_count: snoozeCount
        };
      });

    this.panel.webview.postMessage({
      type: 'updateHighlights',
      highlights: highlightsToShow
    });
  }
}
```

### Part 3: Performance Optimization (Optional)

Since we're fetching from Readwise API on every refresh, we can optimize:

1. **Cache API response in memory** during extension session
2. **Only fetch new highlights** (use `lastReadwiseFetch` for incremental updates)
3. **Full refresh** only when user explicitly requests it

This keeps the DB simple (IDs only) while avoiding excessive API calls.

## Implementation Checklist

### Phase 1: Schema Migration
- [ ] Update `database.ts` to use single `highlights` table
- [ ] Add migration logic to copy from old schema
- [ ] Update `trackHighlight()` to only accept ID
- [ ] Remove `getRecentUnprocessedHighlights()` method
- [ ] Add `getVisibleHighlightIds()` method
- [ ] Test migration with existing database

### Phase 2: Startup Auto-Display
- [ ] Update `extension.ts` to call `readwise.fetchAndShow` on activation
- [ ] Update `WebviewManager` constructor to accept `readwise` client
- [ ] Update `webview.refresh()` to fetch from API instead of DB
- [ ] Update `commands.ts` to only store highlight IDs
- [ ] Test auto-display on extension activation

### Phase 3: Infinite Scroll Implementation
- [ ] Add `oldestLoadedTimestamp` tracking to metadata
- [ ] Update `ReadwiseClient` to support fetching highlights older than timestamp
- [ ] Add `loadMore` message handler in `webview.ts`
- [ ] Update webview frontend to detect scroll position
- [ ] Send `loadMore` message when user reaches last 5 highlights
- [ ] Append new highlights to existing list (don't replace)
- [ ] Show loading indicator while fetching more
- [ ] Stop fetching when no more highlights available

### Phase 4: Testing & Cleanup
- [ ] Test migration from old schema to new
- [ ] Test startup flow with no highlights
- [ ] Test startup flow with existing highlights
- [ ] Test infinite scroll loads older highlights
- [ ] Test infinite scroll stops at end of history
- [ ] Test snooze/archive/integrate actions still work
- [ ] Remove unused code (HighlightData interface, etc.)
- [ ] Update comments/docs to reflect new architecture

## API Rate Limits & Pagination Research

**Readwise Export API** (`/api/v2/export/`):
- ✅ **No explicit rate limit documented** for the export endpoint
- ✅ **Pagination**: Uses `pageCursor` query parameter for fetching large datasets
- ✅ **Incremental fetching**: Supports `updatedAfter` parameter (ISO 8601 format) to fetch only new/updated highlights
- Response includes `nextPageCursor` field (null when no more pages)

**Readwise Reader API** (`/api/v3/list/`):
- ⚠️ **Rate limits**: 20 requests/minute (per access token) for most endpoints
- Higher limits for critical endpoints: Document CREATE/UPDATE = 50 requests/minute
- Returns `429 Too Many Requests` with `Retry-After` header (seconds to wait)
- ✅ **Pagination**: Same `pageCursor` mechanism as Export API

**Our Use Case**:
- We use the **Export API** (`/api/v2/export/`) via `readwise-reader-api` SDK
- SDK's `highlights.export()` method handles pagination automatically
- No rate limit concerns for export endpoint
- Can safely fetch all highlights on startup

## Infinite Scroll Feature Design

**Goal**: When user scrolls to bottom of highlight list, automatically fetch and display older (chronologically prior) highlights.

**Trigger**: User focuses on one of the last 5 highlights in the current view

**Behavior**:
1. Detect when user navigates to highlights at position `length - 5` or greater
2. Fetch next batch of highlights from Readwise API (ordered by `highlighted_at DESC`)
3. Use `highlighted_at` timestamp of oldest currently loaded highlight to fetch chronologically older ones
4. Store NEW highlight IDs in database with status='NEW' (using `INSERT OR IGNORE` - existing records unchanged)
5. **Filter fetched highlights to only visible ones** (status='NEW', not snoozed, not archived, not integrated)
6. If fewer than 30 visible highlights after filtering, fetch another batch
7. Append visible highlights to bottom of current list view
8. Continue until all user's highlights are loaded OR no more highlights available from API

**Key Point**: Infinite scroll must account for already-processed highlights. The API returns ALL highlights, but we only display NEW ones. This means fetching might need multiple API calls to get enough displayable highlights.

**Implementation Notes**:
- Readwise Export API returns highlights in books, each book has `highlights[]` array
- Each highlight has `highlighted_at` timestamp (ISO 8601 format)
- We can sort all highlights across books by `highlighted_at` DESC
- Track "oldest loaded timestamp" to know where to fetch next batch
- Default batch size: 30 highlights per fetch

**Schema Addition** (metadata table):
```sql
-- Add to metadata table:
INSERT INTO metadata (key, value) VALUES
  ('oldestLoadedTimestamp', '<ISO 8601 timestamp>');
```

**Webview Changes**:
- Track current scroll position / selected index
- When `selectedIndex >= highlights.length - 5`:
  - Send message to extension: `{ type: 'loadMore' }`
  - Extension fetches highlights older than `oldestLoadedTimestamp` from API
  - Stores ALL fetched highlight IDs in DB (new ones only, via `INSERT OR IGNORE`)
  - Filters to visible highlights (NEW status, not snoozed)
  - If visible count < 30, continues fetching older batches
  - Updates `oldestLoadedTimestamp` with oldest fetched timestamp
  - Sends only visible highlights to webview for appending

**Critical Logic**:
```typescript
// In WebviewManager.handleLoadMore():
let visibleHighlights = [];
let oldestTimestamp = db.getMetadata('oldestLoadedTimestamp');

while (visibleHighlights.length < 30 && moreAvailable) {
  // Fetch from API
  const batch = await readwise.fetchHighlightsOlderThan(oldestTimestamp);
  if (batch.length === 0) break;

  // Store IDs
  for (const item of batch) {
    db.trackHighlight(String(item.highlight.id)); // INSERT OR IGNORE
  }

  // Filter to visible
  const visibleIds = db.getVisibleHighlightIds();
  const newVisible = batch.filter(item =>
    visibleIds.includes(String(item.highlight.id))
  );

  visibleHighlights.push(...newVisible);
  oldestTimestamp = batch[batch.length - 1].highlight.highlighted_at;
}

db.setMetadata('oldestLoadedTimestamp', oldestTimestamp);
// Send visibleHighlights to webview
```

**Error Handling**:
- If Readwise API returns error: Display error message directly to user (no extra handling)
- Original API errors are easier to debug than abstracted ones

## Open Questions Resolved

1. ✅ **API rate limits**: Export API has no documented rate limits. Reader API has 20 req/min but we don't use it for highlights.
2. ✅ **Error handling**: Display Readwise API errors directly to user. No need for caching or fallbacks.
3. ✅ **Offline support**: Not needed. This is an online-only utility.

## Success Criteria

- ✅ Extension shows 30+ highlights immediately on startup (no manual command needed)
- ✅ Database uses single `highlights` table (matches original spec)
- ✅ Highlight content fetched fresh from Readwise API each session
- ✅ Infinite scroll: When user navigates to last 5 highlights, automatically fetch and display older highlights
- ✅ Infinite feed continues until all user highlights are loaded
- ✅ All existing functionality (snooze, archive, integrate) still works
- ✅ Migration from old schema is seamless (no data loss)
- ✅ Readwise API errors displayed directly to user (no abstraction)
