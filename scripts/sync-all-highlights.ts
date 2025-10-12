#!/usr/bin/env tsx

/**
 * Sync all highlights from Readwise to the local database.
 *
 * This script fetches ALL highlights from Readwise (using pagination automatically)
 * and upserts them into the database. It dedupes based on highlight ID.
 *
 * Usage: tsx scripts/sync-all-highlights.ts
 */

import { Readwise } from 'readwise-reader-api';
import type { ReadwiseBookHighlights } from 'readwise-reader-api';
import { prisma } from '../src/db/client.js';
import * as bookService from '../src/services/bookService.js';
import * as highlightService from '../src/services/highlightService.js';

const READWISE_TOKEN = process.env.READWISE_TOKEN;

if (!READWISE_TOKEN) {
  console.error('❌ READWISE_TOKEN environment variable is required');
  process.exit(1);
}

async function main() {
  console.log('🔄 Starting full sync from Readwise...\n');

  const client = new Readwise({
    auth: READWISE_TOKEN
  });

  // Fetch all highlights (SDK handles pagination automatically)
  console.log('📥 Fetching all highlights from Readwise...');
  const books = await client.highlights.export();

  console.log(`✅ Fetched ${books.length} books from Readwise\n`);

  let totalHighlights = 0;
  let newHighlights = 0;
  let updatedHighlights = 0;
  let newBooks = 0;
  let updatedBooks = 0;

  // Process each book
  for (const book of books) {
    // Upsert book
    const bookExists = await prisma.book.findUnique({
      where: { id: book.user_book_id }
    });

    await bookService.upsertBook({
      user_book_id: book.user_book_id,
      title: book.title,
      author: book.author,
      readable_title: book.readable_title,
      source: book.source,
      cover_image_url: book.cover_image_url,
      unique_url: book.unique_url,
      summary: book.summary,
      book_tags: book.book_tags,
      category: book.category,
      document_note: book.document_note,
      readwise_url: book.readwise_url,
      source_url: book.source_url,
      asin: book.asin,
    });

    if (bookExists) {
      updatedBooks++;
    } else {
      newBooks++;
    }

    // Upsert highlights for this book
    for (const highlight of book.highlights) {
      const highlightExists = await prisma.highlight.findUnique({
        where: { id: String(highlight.id) }
      });

      await highlightService.upsertHighlight({
        id: highlight.id,
        text: highlight.text,
        location: highlight.location,
        location_type: highlight.location_type,
        note: highlight.note,
        color: highlight.color,
        highlighted_at: highlight.highlighted_at,
        created_at: highlight.created_at,
        updated_at: highlight.updated_at,
        external_id: highlight.external_id,
        end_location: highlight.end_location,
        url: highlight.url,
        tags: highlight.tags,
        is_favorite: highlight.is_favorite,
        is_discard: highlight.is_discard,
        readwise_url: highlight.readwise_url,
        book_id: book.user_book_id,
      });

      totalHighlights++;
      if (highlightExists) {
        updatedHighlights++;
      } else {
        newHighlights++;
      }
    }

    // Show progress
    process.stdout.write(`\r📚 Processed ${newBooks + updatedBooks}/${books.length} books, ${totalHighlights} highlights...`);
  }

  console.log('\n\n✅ Sync complete!\n');
  console.log('📊 Summary:');
  console.log(`   Books: ${newBooks} new, ${updatedBooks} updated (${newBooks + updatedBooks} total)`);
  console.log(`   Highlights: ${newHighlights} new, ${updatedHighlights} updated (${totalHighlights} total)`);
}

main()
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
