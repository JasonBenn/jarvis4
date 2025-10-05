import * as sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import * as path from 'path';
import * as fs from 'fs';

interface HighlightState {
  id: string;
  status: 'NEW' | 'INTEGRATED' | 'ARCHIVED';
  snooze_history: string | null;  // JSON array of ISO timestamps
  next_show_date: string | null;  // ISO date
  first_seen: string;
  last_updated: string;
}

export class HighlightDatabase {
  private db: Database | null = null;

  constructor(private dbPath: string) {}

  async initialize(): Promise<void> {
    // Ensure the directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = await open({
      filename: this.dbPath,
      driver: sqlite3.Database
    });

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS highlights (
        id TEXT PRIMARY KEY,
        status TEXT CHECK(status IN ('NEW', 'INTEGRATED', 'ARCHIVED')) DEFAULT 'NEW',
        snooze_history TEXT,
        next_show_date TEXT,
        first_seen TEXT NOT NULL,
        last_updated TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_status ON highlights(status);
      CREATE INDEX IF NOT EXISTS idx_next_show_date ON highlights(next_show_date);
    `);
  }

  async getVisibleHighlightIds(): Promise<string[]> {
    if (!this.db) {throw new Error('Database not initialized');}

    const rows = await this.db.all<{ id: string }[]>(`
      SELECT id FROM highlights
      WHERE status = 'NEW'
         OR (next_show_date IS NOT NULL AND next_show_date <= datetime('now'))
      ORDER BY first_seen DESC
    `);
    return rows.map((r: { id: string }) => r.id);
  }

  async getHighlightState(id: string): Promise<HighlightState | null> {
    if (!this.db) {throw new Error('Database not initialized');}

    const result = await this.db.get<HighlightState>(
      'SELECT * FROM highlights WHERE id = ?',
      [id]
    );
    return result || null;
  }

  async trackHighlight(id: string): Promise<void> {
    if (!this.db) {throw new Error('Database not initialized');}

    const now = new Date().toISOString();

    await this.db.run(`
      INSERT INTO highlights (id, status, first_seen, last_updated)
      VALUES (?, 'NEW', ?, ?)
      ON CONFLICT(id) DO NOTHING
    `, [id, now, now]);
  }

  async updateStatus(id: string, status: 'INTEGRATED' | 'ARCHIVED'): Promise<void> {
    if (!this.db) {throw new Error('Database not initialized');}

    const now = new Date().toISOString();
    await this.db.run(
      'UPDATE highlights SET status = ?, last_updated = ? WHERE id = ?',
      [status, now, id]
    );
  }

  async snoozeHighlight(id: string, durationWeeks: number = 4): Promise<void> {
    if (!this.db) {throw new Error('Database not initialized');}

    const state = await this.getHighlightState(id);
    if (!state) {return;}

    const now = new Date().toISOString();
    const snoozeHistory = state.snooze_history
      ? JSON.parse(state.snooze_history)
      : [];
    snoozeHistory.push(now);

    // Compute next_show_date based on configured duration
    const nextShowDate = new Date();
    nextShowDate.setDate(nextShowDate.getDate() + (durationWeeks * 7));

    await this.db.run(`
      UPDATE highlights
      SET snooze_history = ?,
          next_show_date = ?,
          last_updated = ?
      WHERE id = ?
    `, [
      JSON.stringify(snoozeHistory),
      nextShowDate.toISOString(),
      now,
      id
    ]);
  }

  async getSnoozeCount(id: string): Promise<number> {
    if (!this.db) {throw new Error('Database not initialized');}

    const state = await this.getHighlightState(id);
    if (!state || !state.snooze_history) {return 0;}

    const history = JSON.parse(state.snooze_history);
    return Array.isArray(history) ? history.length : 0;
  }

  dispose(): void {
    this.db?.close();
  }
}
