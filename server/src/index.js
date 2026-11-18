import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { getDatabase, closeDatabase } from './db/connection.js';
import { createApp } from './app.js';

// Ensure DB is initialized and schema migrations/recovery executed
getDatabase();

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info(
    {
      port: config.PORT,
      env: config.NODE_ENV,
      clientOrigin: config.CLIENT_ORIGIN,
      llmModel: config.GROQ_MODEL,
    },
    '🚀 AI Knowledge Inbox server is running'
  );
});

function handleShutdown(signal) {
  logger.info({ signal }, 'Gracefully shutting down server');
  server.close(() => {
    closeDatabase();
    logger.info('Database connection closed. Process terminating.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forcefully terminating server due to shutdown timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
