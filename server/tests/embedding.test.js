import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  parseVector,
  embedText,
  EXPECTED_DIMENSION,
} from '../src/services/embeddingService.js';

describe('Embedding and Cosine Similarity Service', () => {
  describe('cosineSimilarity', () => {
    it('computes 1.0 for identical vectors', () => {
      const v = [0.5, 0.5, 0.5, 0.5];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
    });

    it('computes 0.0 for orthogonal vectors', () => {
      const v1 = [1, 0];
      const v2 = [0, 1];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(0.0, 5);
    });

    it('computes -1.0 for opposite vectors', () => {
      const v1 = [1, 2, 3];
      const v2 = [-1, -2, -3];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1.0, 5);
    });

    it('returns null on dimension mismatch', () => {
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBeNull();
    });

    it('returns null on zero magnitude', () => {
      expect(cosineSimilarity([0, 0], [1, 1])).toBeNull();
    });

    it('returns null on empty or non-array inputs', () => {
      expect(cosineSimilarity([], [])).toBeNull();
      expect(cosineSimilarity(null, [1, 2])).toBeNull();
      expect(cosineSimilarity([1, 2], undefined)).toBeNull();
    });

    it('returns null on NaN or non-finite numbers', () => {
      expect(cosineSimilarity([1, NaN], [1, 2])).toBeNull();
      expect(cosineSimilarity([1, Infinity], [1, 2])).toBeNull();
    });
  });

  describe('parseVector', () => {
    it('safely parses valid 384-dimensional vector JSON', () => {
      const sample = Array(EXPECTED_DIMENSION).fill(0.05);
      const jsonStr = JSON.stringify(sample);
      const parsed = parseVector(jsonStr);
      expect(parsed).toHaveLength(EXPECTED_DIMENSION);
      expect(parsed[0]).toBe(0.05);
    });

    it('returns null for malformed JSON string', () => {
      expect(parseVector('{ not: valid json }')).toBeNull();
      expect(parseVector('')).toBeNull();
      expect(parseVector(null)).toBeNull();
    });

    it('returns null for array with wrong dimension', () => {
      expect(parseVector(JSON.stringify([0.1, 0.2, 0.3]))).toBeNull();
    });
  });

  describe('Real Embedder Test', () => {
    it(
      'generates real 384-dimensional normalized embedding using all-MiniLM-L6-v2',
      async () => {
        const text = 'Testing real MiniLM embedding generation in Node.';
        const vector = await embedText(text);

        expect(vector).toBeInstanceOf(Array);
        expect(vector).toHaveLength(EXPECTED_DIMENSION);

        // Verify normalization: L2 norm = sqrt(sum(v_i^2)) ~= 1.0
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        expect(norm).toBeCloseTo(1.0, 3);
      },
      30000 // allow up to 30s in case first load takes a moment
    );
  });
});
