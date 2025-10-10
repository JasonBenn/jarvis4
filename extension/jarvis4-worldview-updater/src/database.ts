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

    console.log('Database initialized:', this.dbPath);
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
