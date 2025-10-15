import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
});

// Convenience methods for structured logging
export const logRequest = (method: string, url: string, statusCode: number, responseTime: number) => {
  logger.info({
    type: 'http_request',
    method,
    url,
    statusCode,
    responseTime,
  }, `${method} ${url} ${statusCode} - ${responseTime}ms`);
};

export const logError = (error: Error, context?: Record<string, any>) => {
  logger.error({
    type: 'error',
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  }, error.message);
};

export const logDatabaseQuery = (operation: string, table: string, duration?: number) => {
  logger.debug({
    type: 'database_query',
    operation,
    table,
    duration,
  }, `${operation} ${table}${duration ? ` (${duration}ms)` : ''}`);
};

export const logSync = (entity: string, action: string, count: number) => {
  logger.info({
    type: 'sync',
    entity,
    action,
    count,
  }, `${action} ${count} ${entity}`);
};
