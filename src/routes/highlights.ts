import { FastifyInstance } from 'fastify';
import * as highlightService from '../services/highlightService.js';

export async function highlightRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { limit?: string; offset?: string; book_id?: string } }>('/highlights', async (request, reply) => {
    // If book_id is provided, get all highlights for that book
    if (request.query.book_id) {
      const bookId = parseInt(request.query.book_id, 10);
      const highlights = await highlightService.getHighlightsByBookId(bookId);
      return { highlights };
    }

    // Otherwise get visible highlights with pagination
    const limit = request.query.limit ? parseInt(request.query.limit, 10) : undefined;
    const offset = request.query.offset ? parseInt(request.query.offset, 10) : undefined;
    const highlights = await highlightService.getVisibleHighlights(limit, offset);
    return { highlights };
  });

  fastify.get<{ Params: { id: string } }>('/highlights/:id', async (request, reply) => {
    const highlight = await highlightService.getHighlightWithBook(request.params.id);
    if (!highlight) {
      return reply.code(404).send({ error: 'Highlight not found' });
    }
    return highlight;
  });

  fastify.post<{ Params: { id: string } }>('/highlights/:id/track', async (request, reply) => {
    const highlight = await highlightService.trackHighlight(request.params.id);
    return highlight;
  });

  fastify.patch<{
    Params: { id: string };
    Body: { status: 'INTEGRATED' | 'ARCHIVED' };
  }>('/highlights/:id/status', async (request, reply) => {
    const highlight = await highlightService.updateHighlightStatus(
      request.params.id,
      request.body.status
    );
    return highlight;
  });

  fastify.patch<{
    Params: { id: string };
    Body: { durationWeeks: number };
  }>('/highlights/:id/snooze', async (request, reply) => {
    try {
      await highlightService.snoozeHighlight(
        request.params.id,
        request.body.durationWeeks
      );
      return { success: true };
    } catch (error) {
      return reply.code(404).send({ error: (error as Error).message });
    }
  });
}
