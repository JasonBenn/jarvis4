#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OLD_DB_PATH = path.join(
  process.env.HOME!,
  'Library/Application Support/Cursor/User/globalStorage/jasonbenn.jarvis4-worldview-updater/readwise-highlights.db'
);

const NEW_DB_PATH = path.join(__dirname, '..', 'db.sqlite');
const BACKUP_PATH = OLD_DB_PATH + '.backup.' + Date.now();

function querySqlite(dbPath: string, query: string): any[] {
  try {
    const result = execSync(`sqlite3 -list "${dbPath}" "${query}"`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    // Parse output from sqlite3 (-list mode uses | as separator and includes header)
    const lines = result.trim().split('\n');
    if (lines.length === 0 || lines[0] === '') return [];

    // Skip header row (first line)
    return lines.slice(1).map(line => {
      // Split by pipe delimiter
      const values = line.split('|');
      return values;
    });
  } catch (error) {
    console.error('Error querying SQLite:', error);
    return [];
  }
}

async function migrate() {
  console.log('🚀 Starting migration from sql.js to Prisma...\n');

  // Check if old database exists
  if (!fs.existsSync(OLD_DB_PATH)) {
    console.log('⚠️  Old database not found at:', OLD_DB_PATH);
    console.log('No migration needed.');
    return;
  }

  // Backup old database
  console.log('📦 Creating backup of old database...');
  fs.copyFileSync(OLD_DB_PATH, BACKUP_PATH);
  console.log('✅ Backup created at:', BACKUP_PATH);

  // Read all data using sqlite3 CLI
  console.log('\n📖 Reading data from old database...');

  const highlightRows = querySqlite(OLD_DB_PATH, 'SELECT * FROM highlights;');
  const imageRows = querySqlite(OLD_DB_PATH, 'SELECT * FROM generated_images;');
  const metadataRows = querySqlite(OLD_DB_PATH, 'SELECT * FROM metadata;');

  console.log(`  - Found ${highlightRows.length} highlights`);
  console.log(`  - Found ${imageRows.length} generated images`);
  console.log(`  - Found ${metadataRows.length} metadata entries`);

  // Initialize Prisma client
  console.log('\n💾 Writing data to new Prisma database...');
  const prisma = new PrismaClient();

  try {
    // Migrate highlights - parse row format: id|status|snooze_history|next_show_date|first_seen|last_updated
    for (const row of highlightRows) {
      const [id, status, snooze_history, next_show_date, first_seen, last_updated] = row;
      await prisma.highlight.upsert({
        where: { id },
        update: {
          status: status || 'NEW',
          snoozeHistory: snooze_history === 'NULL' || !snooze_history ? null : snooze_history,
          nextShowDate: next_show_date === 'NULL' || !next_show_date ? null : new Date(next_show_date),
          firstSeen: new Date(first_seen),
          lastUpdated: new Date(last_updated),
        },
        create: {
          id,
          status: status || 'NEW',
          snoozeHistory: snooze_history === 'NULL' || !snooze_history ? null : snooze_history,
          nextShowDate: next_show_date === 'NULL' || !next_show_date ? null : new Date(next_show_date),
          firstSeen: new Date(first_seen),
          lastUpdated: new Date(last_updated),
        },
      });
    }
    console.log(`  ✅ Migrated ${highlightRows.length} highlights`);

    // Migrate generated images - format: id|entry_hash|image_url|document_id|created_at
    for (const row of imageRows) {
      const [id, entry_hash, image_url, document_id, created_at] = row;
      await prisma.generatedImage.upsert({
        where: { entryHash: entry_hash },
        update: {
          imageUrl: image_url,
          documentId: document_id === 'NULL' || !document_id ? null : document_id,
          createdAt: created_at ? new Date(created_at) : new Date(),
        },
        create: {
          entryHash: entry_hash,
          imageUrl: image_url,
          documentId: document_id === 'NULL' || !document_id ? null : document_id,
          createdAt: created_at ? new Date(created_at) : new Date(),
        },
      });
    }
    console.log(`  ✅ Migrated ${imageRows.length} generated images`);

    // Migrate metadata - format: key|value|updated_at
    for (const row of metadataRows) {
      const [key, value, updated_at] = row;
      await prisma.metadata.upsert({
        where: { key },
        update: {
          value,
          updatedAt: updated_at ? new Date(updated_at) : new Date(),
        },
        create: {
          key,
          value,
          updatedAt: updated_at ? new Date(updated_at) : new Date(),
        },
      });
    }
    console.log(`  ✅ Migrated ${metadataRows.length} metadata entries`);

    // Verify migration
    console.log('\n🔍 Verifying migration...');
    const newHighlights = await prisma.highlight.count();
    const newImages = await prisma.generatedImage.count();
    const newMetadata = await prisma.metadata.count();

    console.log(`  - Highlights: ${newHighlights} (expected ${highlightRows.length})`);
    console.log(`  - Images: ${newImages} (expected ${imageRows.length})`);
    console.log(`  - Metadata: ${newMetadata} (expected ${metadataRows.length})`);

    if (
      newHighlights === highlightRows.length &&
      newImages === imageRows.length &&
      newMetadata === metadataRows.length
    ) {
      console.log('\n✅ Migration completed successfully!');
      console.log('\n📝 Next steps:');
      console.log('  1. Load the backend service: pnpm backend:load');
      console.log('  2. Start the backend: pnpm backend:start');
      console.log('  3. Test the VSCode extension');
      console.log('\n💡 Old database backed up at:', BACKUP_PATH);
    } else {
      console.error('\n❌ Migration verification failed! Count mismatch detected.');
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

migrate().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
