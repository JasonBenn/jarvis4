import { FastifyInstance } from 'fastify';
import * as bookService from '../services/bookService.js';
import * as highlightService from '../services/highlightService.js';

export async function syncRoutes(fastify: FastifyInstance) {
  // Sync books and highlights from Readwise
  fastify.post<{
    Body: {
      books: bookService.BookData[];
      highlights: highlightService.HighlightData[];
    };
  }>('/sync', async (request, reply) => {
    const { books, highlights } = request.body;

    request.log.info({
      type: 'sync_start',
      booksCount: books.length,
      highlightsCount: highlights.length,
    }, `Starting sync: ${books.length} books, ${highlights.length} highlights`);

    try {
      // Upsert books first
      for (const bookData of books) {
        await bookService.upsertBook(bookData);
      }

      // Then upsert highlights
      for (const highlightData of highlights) {
        await highlightService.upsertHighlight(highlightData);
      }

      request.log.info({
        type: 'sync_complete',
        booksCount: books.length,
        highlightsCount: highlights.length,
      }, `Sync complete: ${books.length} books, ${highlights.length} highlights`);

      return {
        success: true,
        synced: {
          books: books.length,
          highlights: highlights.length,
        },
      };
    } catch (error) {
      request.log.error({
        type: 'sync_error',
        booksCount: books.length,
        highlightsCount: highlights.length,
        error: {
          name: (error as Error).name,
          message: (error as Error).message,
          stack: (error as Error).stack,
        },
      }, `Sync failed: ${(error as Error).message}`);
      return reply.code(500).send({ error: 'Sync failed' });
    }
  });
}
