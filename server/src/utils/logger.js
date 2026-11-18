import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

export const logger = pino({
  level: isTest ? 'silent' : (process.env.LOG_LEVEL || 'info'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'apiKey',
      'GROQ_API_KEY',
      '*.apiKey',
      '*.GROQ_API_KEY',
    ],
    censor: '[REDACTED]',
  },
  transport: !isProduction && !isTest ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
});
