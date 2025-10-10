#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

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

  // Import the test exports bundle
  const { HighlightDatabase } = require('./dist/test-exports');

  // Test 1: Fresh database creation
  log(COLORS.yellow, '📝 Test 1: Create fresh database');
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const db1 = new HighlightDatabase(TEST_DB_PATH);
  await db1.initialize();
  assert(fs.existsSync(TEST_DB_PATH), 'Database file created');

  // Test 2: Track highlights with data
  log(COLORS.yellow, '\n📝 Test 2: Track highlights with data');
  db1.trackHighlight('highlight-001', {
    id: 'highlight-001',
    text: 'First highlight text',
    highlighted_at: '2025-01-01T10:00:00.000Z',
    book_title: 'Test Book 1',
    book_author: 'Author 1'
  });
  db1.trackHighlight('highlight-002', {
    id: 'highlight-002',
    text: 'Second highlight text',
    highlighted_at: '2025-01-02T10:00:00.000Z',
    book_title: 'Test Book 2',
    book_author: 'Author 2'
  });
  db1.trackHighlight('highlight-003', {
    id: 'highlight-003',
    text: 'Third highlight text',
    highlighted_at: '2025-01-03T10:00:00.000Z',
    book_title: 'Test Book 3',
    book_author: null
  });

  const visible1 = db1.getVisibleHighlightIds();
  assert(visible1.length === 3, `Should have 3 NEW highlights (got ${visible1.length})`);

  // Test 2b: Get recent unprocessed highlights
  log(COLORS.yellow, '\n📝 Test 2b: Get recent unprocessed highlights with data');
  const recentHighlights = db1.getRecentUnprocessedHighlights(10);
  assert(recentHighlights.length === 3, `Should have 3 recent highlights (got ${recentHighlights.length})`);
  assert(recentHighlights[0].id === 'highlight-003', `Most recent should be highlight-003 (got ${recentHighlights[0].id})`);
  assert(recentHighlights[0].text === 'Third highlight text', `Should have correct text`);
  assert(recentHighlights[0].book_title === 'Test Book 3', `Should have correct book title`);

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

  // Manually set past snooze date via direct SQL
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 7);

  // Access db property directly for this test hack
  if (db2.db) {
    const stmt = db2.db.prepare(`
      UPDATE highlight_states
      SET next_show_date = ?
      WHERE id = ?
    `);
    stmt.bind([pastDate.toISOString(), 'highlight-004']);
    stmt.step();
    stmt.free();

    // Force save
    const data = db2.db.export();
    const buffer = Buffer.from(data);
    const dir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(TEST_DB_PATH, buffer);
  }

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
  console.error(err.stack);
  process.exit(1);
});
