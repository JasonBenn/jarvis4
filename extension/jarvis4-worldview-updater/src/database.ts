import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';

interface HighlightState {
  id: string;
  status: 'NEW' | 'INTEGRATED' | 'ARCHIVED';
  snooze_history: string | null;
  next_show_date: string | null;
  first_seen: string;
  last_updated: string;
}

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

    // Check current schema version and migrate if needed
    const versionResult = this.db!.exec('PRAGMA user_version');
    const currentVersion = (versionResult[0]?.values[0]?.[0] as number) || 0;

    if (currentVersion === 0) {
      // Version 0: Old two-table schema or brand new database
      this.migrateToV1();
    }

    console.log('Database initialized:', this.dbPath);
  }

  private migrateToV1(): void {
    if (!this.db) {return;}

    console.log('Migrating to schema version 1...');

    // Check if old schema exists
    const checkStmt = this.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='highlight_states'
    `);
    const hasOldSchema = checkStmt.step();
    checkStmt.free();

    if (hasOldSchema) {
      console.log('Migrating from old two-table schema to new single-table schema...');

      // Create new table
      this.db.run(`
        CREATE TABLE highlights (
          id TEXT PRIMARY KEY,
          status TEXT CHECK(status IN ('NEW', 'INTEGRATED', 'ARCHIVED')) DEFAULT 'NEW',
          snooze_history TEXT,
          next_show_date TEXT,
          first_seen TEXT NOT NULL,
          last_updated TEXT NOT NULL
        )
      `);

      // Copy data from old table
      this.db.run(`
        INSERT INTO highlights (id, status, snooze_history, next_show_date, first_seen, last_updated)
        SELECT id, status, snooze_history, next_show_date, first_seen, last_updated
        FROM highlight_states
      `);

      // Drop old tables
      this.db.run('DROP TABLE highlight_states');
      this.db.run('DROP TABLE IF EXISTS highlight_data');

      // Clear lastReadwiseFetch to trigger fresh fetch (since we dropped highlight_data)
      const metadataExists = this.db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='metadata'"
      )[0];

      if (metadataExists) {
        this.db.run('DELETE FROM metadata WHERE key = ?', ['lastReadwiseFetch']);
      }
    } else {
      // Brand new database - create schema from scratch
      this.db.run(`
        CREATE TABLE highlights (
          id TEXT PRIMARY KEY,
          status TEXT CHECK(status IN ('NEW', 'INTEGRATED', 'ARCHIVED')) DEFAULT 'NEW',
          snooze_history TEXT,
          next_show_date TEXT,
          first_seen TEXT NOT NULL,
          last_updated TEXT NOT NULL
        )
      `);
    }

    // Create metadata table (needed for both new and migrated databases)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create indexes
    this.db.run('CREATE INDEX idx_status ON highlights(status)');
    this.db.run('CREATE INDEX idx_next_show_date ON highlights(next_show_date)');

    // Set schema version
    this.db.run('PRAGMA user_version = 1');

    this.save();
    console.log('Migration to schema version 1 completed');
  }

  getVisibleHighlightIds(): string[] {
    if (!this.db) {return [];}

    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT id FROM highlights
      WHERE status = 'NEW'
        AND (next_show_date IS NULL OR next_show_date <= ?)
      ORDER BY first_seen DESC
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
    if (!this.db) {return null;}

    const stmt = this.db.prepare(`
      SELECT * FROM highlights WHERE id = ?
    `);
    stmt.bind([id]);

    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as HighlightState;
      stmt.free();
      return row;
    }

    stmt.free();
    return null;
  }

  trackHighlight(id: string): void {
    if (!this.db) {return;}

    const now = new Date().toISOString();

    // Insert highlight ID only
    this.db.run(`
      INSERT OR IGNORE INTO highlights
      (id, status, snooze_history, next_show_date, first_seen, last_updated)
      VALUES (?, 'NEW', NULL, NULL, ?, ?)
    `, [id, now, now]);

    this.save();
  }

  updateStatus(id: string, status: 'INTEGRATED' | 'ARCHIVED'): void {
    if (!this.db) {return;}

    const now = new Date().toISOString();
    this.db.run(`
      UPDATE highlights
      SET status = ?, last_updated = ?
      WHERE id = ?
    `, [status, now, id]);

    this.save();
  }

  snoozeHighlight(id: string, durationWeeks: number = 4): void {
    if (!this.db) {return;}

    const state = this.getHighlightState(id);
    if (!state) {return;}

    const now = new Date().toISOString();
    const snoozeHistory = state.snooze_history
      ? JSON.parse(state.snooze_history)
      : [];
    snoozeHistory.push(now);

    const nextShowDate = new Date();
    nextShowDate.setDate(nextShowDate.getDate() + (durationWeeks * 7));

    this.db.run(`
      UPDATE highlights
      SET snooze_history = ?, next_show_date = ?, last_updated = ?
      WHERE id = ?
    `, [JSON.stringify(snoozeHistory), nextShowDate.toISOString(), now, id]);

    this.save();
  }

  getSnoozeCount(id: string): number {
    const state = this.getHighlightState(id);
    if (!state || !state.snooze_history) {return 0;}

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
    if (!this.db) {return null;}

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
    if (!this.db) {return;}

    const now = new Date().toISOString();
    this.db.run(`
      INSERT OR REPLACE INTO metadata (key, value, updated_at)
      VALUES (?, ?, ?)
    `, [key, value, now]);

    this.save();
  }

  private save(): void {
    if (!this.db) {return;}

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
