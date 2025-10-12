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

    try {
      // Upsert books first
      for (const bookData of books) {
        await bookService.upsertBook(bookData);
      }

      // Then upsert highlights
      for (const highlightData of highlights) {
        await highlightService.upsertHighlight(highlightData);
      }

      return {
        success: true,
        synced: {
          books: books.length,
          highlights: highlights.length,
        },
      };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Sync failed' });
    }
  });
}
