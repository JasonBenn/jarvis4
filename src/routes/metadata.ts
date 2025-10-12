import { FastifyInstance } from 'fastify';
import * as metadataService from '../services/metadataService.js';

export async function metadataRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { key: string } }>('/metadata/:key', async (request, reply) => {
    const value = await metadataService.getMetadata(request.params.key);
    if (value === undefined) {
      return reply.code(404).send({ error: 'Metadata key not found' });
    }
    return { key: request.params.key, value };
  });

  fastify.put<{
    Params: { key: string };
    Body: { value: string };
  }>('/metadata/:key', async (request, reply) => {
    const metadata = await metadataService.setMetadata(
      request.params.key,
      request.body.value
    );
    return metadata;
  });
}
