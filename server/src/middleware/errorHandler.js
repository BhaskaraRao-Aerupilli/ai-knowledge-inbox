import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export function errorHandler(err, req, res, next) {
  // Check if error is a Zod validation error
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: `Validation failed: ${message}`,
        details: err.issues,
      },
    });
  }

  // Handle JSON parse errors from body-parser
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Malformed JSON payload',
      },
    });
  }

  // Handle typed AppErrors
  if (err instanceof AppError) {
    logger.warn({ code: err.code, status: err.statusCode, message: err.message }, 'Application error handled');
    const response = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };
    if (err.details && !config.isProduction) {
      response.error.details = err.details;
    }
    return res.status(err.statusCode).json(response);
  }

  // Unhandled internal server error
  logger.error({ err }, 'Unhandled server error');
  const response = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.isProduction ? 'An unexpected internal error occurred' : err.message,
    },
  };

  if (!config.isProduction && err.stack) {
    response.error.stack = err.stack;
  }

  return res.status(500).json(response);
}
