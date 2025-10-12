#!/usr/bin/env tsx

/**
 * Update highlights to INTEGRATED status based on their presence in Neighborhood Notes.
 *
 * This script:
 * 1. Searches all .md files in Neighborhood Notes for highlight references (pattern: ###### {id})
 * 2. Extracts all unique highlight IDs found
 * 3. Updates the database to mark those highlights as INTEGRATED
 *
 * Usage: pnpm update:integrated
 */

import { execSync } from 'child_process';
import { prisma } from '../src/db/client.js';

const NOTES_DIR = '/Users/jasonbenn/notes';

async function main() {
  console.log('🔍 Searching for highlight references in Neighborhood Notes...\n');

  // Grep for highlight ID pattern: ###### {number}
  // The pattern matches 6 or more # followed by a space and numbers
  try {
    const grepOutput = execSync(
      `grep -roh "^#\\{6,\\} [0-9]\\+" "${NOTES_DIR}" --include="*.md" || true`,
      { encoding: 'utf-8' }
    );

    if (!grepOutput.trim()) {
      console.log('ℹ️  No highlight references found in notes.');
      return;
    }

    // Extract unique highlight IDs
    const highlightIds = new Set<string>();
    const lines = grepOutput.trim().split('\n');

    for (const line of lines) {
      // Extract the number from lines like "###### 548707126"
      const match = line.match(/^#{6,}\s+(\d+)$/);
      if (match) {
        highlightIds.add(match[1]);
      }
    }

    console.log(`✅ Found ${highlightIds.size} unique highlight references\n`);

    if (highlightIds.size === 0) {
      console.log('ℹ️  No valid highlight IDs to process.');
      return;
    }

    // Update highlights in database
    console.log('📝 Updating highlight statuses to INTEGRATED...\n');

    let updatedCount = 0;
    let notFoundCount = 0;
    let alreadyIntegratedCount = 0;

    for (const id of highlightIds) {
      try {
        const existing = await prisma.highlight.findUnique({
          where: { id }
        });

        if (!existing) {
          notFoundCount++;
          continue;
        }

        if (existing.status === 'INTEGRATED') {
          alreadyIntegratedCount++;
          continue;
        }

        await prisma.highlight.update({
          where: { id },
          data: {
            status: 'INTEGRATED',
            lastUpdated: new Date()
          }
        });

        updatedCount++;
      } catch (error) {
        console.error(`❌ Error updating highlight ${id}:`, error);
      }
    }

    console.log('✅ Update complete!\n');
    console.log('📊 Summary:');
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Already integrated: ${alreadyIntegratedCount}`);
    console.log(`   Not found in DB: ${notFoundCount}`);
    console.log(`   Total processed: ${highlightIds.size}`);
  } catch (error) {
    console.error('❌ Error during search:', error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
