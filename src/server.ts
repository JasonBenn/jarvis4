import Fastify from 'fastify';
import cors from '@fastify/cors';
import { highlightRoutes } from './routes/highlights.js';
import { generatedImageRoutes } from './routes/generated-images.js';
import { metadataRoutes } from './routes/metadata.js';

const PORT = parseInt(process.env.JARVIS4_PORT || '3456');

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'development' ? 'info' : 'error',
  },
});

// Register CORS for local development
await fastify.register(cors, {
  origin: true,
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

// Register routes
await fastify.register(highlightRoutes);
await fastify.register(generatedImageRoutes);
await fastify.register(metadataRoutes);

// Start server
try {
  await fastify.listen({ port: PORT, host: '127.0.0.1' });
  console.log(`🚀 Jarvis4 backend listening on http://127.0.0.1:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
