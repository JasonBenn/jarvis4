import Fastify from 'fastify';
import cors from '@fastify/cors';
import { highlightRoutes } from './routes/highlights.js';
import { generatedImageRoutes } from './routes/generated-images.js';
import { metadataRoutes } from './routes/metadata.js';
import { syncRoutes } from './routes/sync.js';
import { logger } from './utils/logger.js';

const PORT = parseInt(process.env.JARVIS4_PORT || '3456');

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    } : undefined,
  },
  disableRequestLogging: true, // We'll handle this with our middleware
});

// Register CORS for local development
await fastify.register(cors, {
  origin: true,
});

// Request logging middleware
fastify.addHook('onRequest', async (request, reply) => {
  request.log.info({
    type: 'http_request_start',
    method: request.method,
    url: request.url,
    headers: request.headers,
  }, `→ ${request.method} ${request.url}`);
});

// Response logging middleware
fastify.addHook('onResponse', async (request, reply) => {
  const responseTime = reply.getResponseTime();
  request.log.info({
    type: 'http_request_complete',
    method: request.method,
    url: request.url,
    statusCode: reply.statusCode,
    responseTime,
  }, `← ${request.method} ${request.url} ${reply.statusCode} - ${responseTime.toFixed(2)}ms`);
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

// Register routes
await fastify.register(highlightRoutes);
await fastify.register(generatedImageRoutes);
await fastify.register(metadataRoutes);
await fastify.register(syncRoutes);

// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  request.log.error({
    type: 'error',
    method: request.method,
    url: request.url,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  }, `Error handling ${request.method} ${request.url}: ${error.message}`);

  // Send appropriate error response
  const statusCode = error.statusCode || 500;
  reply.status(statusCode).send({
    error: error.message,
    statusCode,
  });
});

// Start server
try {
  await fastify.listen({ port: PORT, host: '127.0.0.1' });
  logger.info({ type: 'server_start', port: PORT }, `🚀 Jarvis4 backend listening on http://127.0.0.1:${PORT}`);
} catch (err) {
  logger.error({ type: 'server_start_error', error: err }, 'Failed to start server');
  process.exit(1);
}
