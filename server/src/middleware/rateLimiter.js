import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

export const createLimiter = (options = {}) => {
  return rateLimit({
    windowMs: options.windowMs || config.RATE_LIMIT_WINDOW_MS || 60000,
    max: options.max || config.RATE_LIMIT_MAX_REQUESTS || 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests, please slow down and try again later.',
      },
    },
    skip: () => config.isTest, // Disable rate limiting during tests
  });
};

export const ingestLimiter = createLimiter({ max: 30 }); // 30 ingests / min
export const queryLimiter = createLimiter({ max: 60 });  // 60 queries / min
