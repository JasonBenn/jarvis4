import { FastifyInstance } from 'fastify';
import * as highlightService from '../services/highlightService.js';

export async function highlightRoutes(fastify: FastifyInstance) {
  fastify.get('/highlights', async (request, reply) => {
    const highlights = await highlightService.getVisibleHighlights();
    return { highlights };
  });

  fastify.get<{ Params: { id: string } }>('/highlights/:id', async (request, reply) => {
    const highlight = await highlightService.getHighlight(request.params.id);
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
