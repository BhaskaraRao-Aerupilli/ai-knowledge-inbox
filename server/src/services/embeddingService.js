import { pipeline } from '@huggingface/transformers';
import { EmbeddingServiceError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const EMBEDDING_MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
export const EXPECTED_DIMENSION = 384;

let extractorInstance = null;
let initPromise = null;

/**
 * Initializes and returns the singleton embedding pipeline.
 */
export async function getEmbeddingPipeline() {
  if (extractorInstance) {
    return extractorInstance;
  }
  if (!initPromise) {
    initPromise = (async () => {
      try {
        logger.info({ model: EMBEDDING_MODEL_NAME }, 'Loading local embedding model');
        extractorInstance = await pipeline('feature-extraction', EMBEDDING_MODEL_NAME);
        logger.info('Embedding model loaded successfully');
        return extractorInstance;
      } catch (err) {
        initPromise = null;
        extractorInstance = null;
        logger.error({ err }, 'Failed to initialize embedding model');
        throw new EmbeddingServiceError('Failed to load local embedding model', err.message);
      }
    })();
  }
  return initPromise;
}

/**
 * Generates a normalized 384-dimensional embedding for the given text.
 *
 * @param {string} text
 * @returns {Promise<number[]>} Float array of length 384
 */
export async function embedText(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new EmbeddingServiceError('Cannot generate embedding for empty text');
  }

  try {
    const extractor = await getEmbeddingPipeline();
    const output = await extractor(text, {
      pooling: 'mean',
      normalize: true,
    });

    const vector = Array.from(output.data);
    if (vector.length !== EXPECTED_DIMENSION) {
      throw new EmbeddingServiceError(
        `Unexpected embedding dimension: got ${vector.length}, expected ${EXPECTED_DIMENSION}`
      );
    }
    return vector;
  } catch (err) {
    if (err instanceof EmbeddingServiceError) throw err;
    logger.error({ err, text: text.slice(0, 80) }, 'Embedding generation failed');
    throw new EmbeddingServiceError('Error computing vector embedding', err.message);
  }
}

/**
 * Generates embeddings for an array of text chunks sequentially or in batches.
 *
 * @param {string[]} texts
 * @returns {Promise<Array<number[]>>}
 */
export async function embedBatch(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const embeddings = [];
  for (const text of texts) {
    embeddings.push(await embedText(text));
  }
  return embeddings;
}

/**
 * Calculates cosine similarity between two float vectors.
 * Handles empty vectors, dimension mismatch, zero magnitude, or non-finite numbers safely.
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number|null} Similarity score in [-1, 1], or null if invalid
 */
export function cosineSimilarity(vecA, vecB) {
  if (!Array.isArray(vecA) || !Array.isArray(vecB)) return null;
  if (vecA.length === 0 || vecB.length === 0) return null;
  if (vecA.length !== vecB.length) return null;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i];
    const b = vecB[i];
    if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) {
      return null;
    }
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA <= 0 || normB <= 0) return null;

  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  // Bound to [-1, 1] to guard against floating point inaccuracies
  return Math.max(-1, Math.min(1, similarity));
}

/**
 * Safely parses a JSON-serialized vector from SQLite.
 *
 * @param {string} jsonStr
 * @returns {number[]|null}
 */
export function parseVector(jsonStr) {
  if (!jsonStr || typeof jsonStr !== 'string') return null;
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed) || parsed.length !== EXPECTED_DIMENSION) {
      logger.warn({ length: parsed?.length }, 'Chunk embedding has unexpected dimension or structure');
      return null;
    }
    return parsed;
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to parse JSON embedding from database');
    return null;
  }
}
