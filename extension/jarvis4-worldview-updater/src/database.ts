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

export interface HighlightData {
  id: string;
  text: string;
  highlighted_at: string | null;
  book_title: string;
  book_author: string | null;
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

    // Create schema
    this.db!.run(`
      CREATE TABLE IF NOT EXISTS highlight_states (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK(status IN ('NEW', 'INTEGRATED', 'ARCHIVED')),
        snooze_history TEXT,
        next_show_date TEXT,
        first_seen TEXT NOT NULL,
        last_updated TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS highlight_data (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        highlighted_at TEXT,
        book_title TEXT NOT NULL,
        book_author TEXT
      );

      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_status ON highlight_states(status);
      CREATE INDEX IF NOT EXISTS idx_next_show_date ON highlight_states(next_show_date);
      CREATE INDEX IF NOT EXISTS idx_highlighted_at ON highlight_data(highlighted_at);
    `);

    // Save initial database to disk
    this.save();

    // Migration: If we have highlight_states but no highlight_data, clear lastReadwiseFetch
    // This handles the case where the old version created states without data
    this.migrateIfNeeded();

    console.log('Database initialized:', this.dbPath);
  }

  private migrateIfNeeded(): void {
    if (!this.db) {return;}

    // Count states and data
    const statesStmt = this.db.prepare('SELECT COUNT(*) as count FROM highlight_states');
    statesStmt.step();
    const statesCount = statesStmt.getAsObject().count as number;
    statesStmt.free();

    const dataStmt = this.db.prepare('SELECT COUNT(*) as count FROM highlight_data');
    dataStmt.step();
    const dataCount = dataStmt.getAsObject().count as number;
    dataStmt.free();

    // If we have states but no data, clear lastReadwiseFetch to trigger re-fetch
    if (statesCount > 0 && dataCount === 0) {
      console.log('Migration: Found highlight states without data, clearing lastReadwiseFetch to trigger re-fetch');
      this.db.run('DELETE FROM metadata WHERE key = ?', ['lastReadwiseFetch']);
      this.save();
    }
  }

  getVisibleHighlightIds(): string[] {
    if (!this.db) {return [];}

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
    if (!this.db) {return null;}

    const stmt = this.db.prepare(`
      SELECT * FROM highlight_states WHERE id = ?
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

  trackHighlight(id: string, data?: HighlightData): void {
    if (!this.db) {return;}

    const now = new Date().toISOString();

    // Insert state
    this.db.run(`
      INSERT OR IGNORE INTO highlight_states
      (id, status, snooze_history, next_show_date, first_seen, last_updated)
      VALUES (?, 'NEW', NULL, NULL, ?, ?)
    `, [id, now, now]);

    // Insert data if provided
    if (data) {
      this.db.run(`
        INSERT OR REPLACE INTO highlight_data
        (id, text, highlighted_at, book_title, book_author)
        VALUES (?, ?, ?, ?, ?)
      `, [data.id, data.text, data.highlighted_at, data.book_title, data.book_author]);
    }

    this.save();
  }

  updateStatus(id: string, status: 'INTEGRATED' | 'ARCHIVED'): void {
    if (!this.db) {return;}

    const now = new Date().toISOString();
    this.db.run(`
      UPDATE highlight_states
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
      UPDATE highlight_states
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

  // Get most recent unprocessed highlights with full data
  getRecentUnprocessedHighlights(limit: number = 30): HighlightData[] {
    if (!this.db) {return [];}

    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      SELECT d.id, d.text, d.highlighted_at, d.book_title, d.book_author
      FROM highlight_data d
      INNER JOIN highlight_states s ON d.id = s.id
      WHERE s.status = 'NEW'
        AND (s.next_show_date IS NULL OR s.next_show_date <= ?)
      ORDER BY d.highlighted_at DESC
      LIMIT ?
    `);

    stmt.bind([now, limit]);
    const highlights: HighlightData[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as unknown as HighlightData;
      highlights.push(row);
    }
    stmt.free();

    return highlights;
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
