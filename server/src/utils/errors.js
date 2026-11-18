export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Invalid request data', details = null) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class UnprocessableError extends AppError {
  constructor(message = 'Unprocessable content', details = null) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMITED');
  }
}

export class GroqServiceError extends AppError {
  constructor(message = 'LLM generation service failed', details = null) {
    super(message, 502, 'GROQ_FAILURE', details);
  }
}

export class EmbeddingServiceError extends AppError {
  constructor(message = 'Embedding model service unavailable', details = null) {
    super(message, 503, 'EMBEDDING_UNAVAILABLE', details);
  }
}
