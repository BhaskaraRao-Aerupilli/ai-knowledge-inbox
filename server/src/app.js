import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { NotFoundError } from './utils/errors.js';

export function createApp() {
  const app = express();

  // Request logging with redactions
  if (!config.isTest) {
    app.use(
      pinoHttp({
        logger,
        autoLogging: {
          ignore: (req) => req.url === '/health',
        },
      })
    );
  }

  // Security: strict CORS limited to client origin
  app.use(
    cors({
      origin: config.CLIENT_ORIGIN,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  );

  // Body parsing with safe size limit
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // API routes
  app.use('/', routes);

  // 404 handler
  app.use((req, res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
  });

  // Central error handling middleware
  app.use(errorHandler);

  return app;
}
