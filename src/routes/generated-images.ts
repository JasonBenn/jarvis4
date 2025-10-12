import { FastifyInstance } from 'fastify';
import * as imageService from '../services/imageService.js';

export async function generatedImageRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { entryHash: string } }>(
    '/generated-images/:entryHash',
    async (request, reply) => {
      const image = await imageService.getImageByHash(request.params.entryHash);
      if (!image) {
        return reply.code(404).send({ error: 'Image not found' });
      }
      return image;
    }
  );

  fastify.post<{ Body: { entryHash: string; imageUrl: string } }>(
    '/generated-images',
    async (request, reply) => {
      const image = await imageService.createImage(
        request.body.entryHash,
        request.body.imageUrl
      );
      return image;
    }
  );

  fastify.patch<{
    Params: { entryHash: string };
    Body: { documentId: string };
  }>('/generated-images/:entryHash', async (request, reply) => {
    const image = await imageService.updateImageDocument(
      request.params.entryHash,
      request.body.documentId
    );
    return image;
  });
}
