import initSqlJs, { Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';

const DB_PATH = join(
  homedir(),
  'Library/Application Support/Cursor/User/globalStorage/jasonbenn.jarvis4-worldview-updater/readwise-highlights.db'
);

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (db) return db;

  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(new Uint8Array(buffer));
  } else {
    db = new SQL.Database();
  }

  return db;
}

function saveDb(): void {
  if (!db) return;

  const data = db.export();
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(DB_PATH, Buffer.from(data));
}

export interface GeneratedImage {
  id: string;
  entry_hash: string;
  image_url: string;
  document_id: string | null;
  created_at: string;
}

export const generatedImages = {
  async findByEntryHash(entryHash: string): Promise<GeneratedImage | undefined> {
    const database = await getDb();
    const stmt = database.prepare('SELECT * FROM generated_images WHERE entry_hash = ?');
    stmt.bind([entryHash]);

    if (stmt.step()) {
      const row = stmt.getAsObject() as unknown as GeneratedImage;
      stmt.free();
      return row;
    }

    stmt.free();
    return undefined;
  },

  async create(entryHash: string, imageUrl: string): Promise<GeneratedImage> {
    const database = await getDb();
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    database.run(
      'INSERT INTO generated_images (id, entry_hash, image_url, created_at) VALUES (?, ?, ?, ?)',
      [id, entryHash, imageUrl, createdAt]
    );

    saveDb();
    return { id, entry_hash: entryHash, image_url: imageUrl, document_id: null, created_at: createdAt };
  },

  async updateDocumentId(entryHash: string, documentId: string): Promise<void> {
    const database = await getDb();
    database.run(
      'UPDATE generated_images SET document_id = ? WHERE entry_hash = ?',
      [documentId, entryHash]
    );
    saveDb();
  },
};
