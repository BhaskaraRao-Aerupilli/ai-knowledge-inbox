import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../src/db/connection.js';
import { ItemRepository } from '../src/db/repositories/itemRepository.js';
import { ChunkRepository } from '../src/db/repositories/chunkRepository.js';
import { retrieveRelevantChunks } from '../src/services/retrievalService.js';
import { executeQuery, INSUFFICIENT_CONTEXT_MESSAGE } from '../src/services/queryService.js';
import { GroqServiceError } from '../src/utils/errors.js';
import * as embeddingService from '../src/services/embeddingService.js';

describe('Retrieval and Query Service', () => {
  let db;
  let itemRepo;
  let chunkRepo;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    itemRepo = new ItemRepository(db);
    chunkRepo = new ChunkRepository(db);

    // Mock the singleton repositories to use our in-memory DB for these tests
    vi.spyOn(chunkRepo, 'getAllWithItemMetadata');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  describe('retrieveRelevantChunks', () => {
    it('returns empty results when DB has no chunks', async () => {
      const result = await retrieveRelevantChunks('what is RAG?', {
        queryVector: Array(384).fill(0.1),
      });
      expect(result.chunks).toEqual([]);
      expect(result.hasContext).toBe(false);
    });

    it('filters out chunks below similarity threshold and ranks properly', async () => {
      // Mock getAllWithItemMetadata
      const vQuery = Array(384).fill(0);
      vQuery[0] = 1; // unit vector along dim 0

      const vHigh = Array(384).fill(0);
      vHigh[0] = 0.9;
      vHigh[1] = 0.1; // similarity close to 0.99

      const vLow = Array(384).fill(0);
      vLow[1] = 1; // orthogonal, similarity = 0.0

      const vMid = Array(384).fill(0);
      vMid[0] = 0.5;
      vMid[1] = 0.5; // similarity ~ 0.707

      const mockData = [
        {
          id: 'c-low',
          item_id: 'i-1',
          chunk_index: 0,
          chunk_text: 'Low relevance text',
          embedding: JSON.stringify(vLow),
          item_title: 'Low Note',
          source_url: null,
          source_type: 'note',
        },
        {
          id: 'c-high',
          item_id: 'i-2',
          chunk_index: 0,
          chunk_text: 'High relevance text',
          embedding: JSON.stringify(vHigh),
          item_title: 'High Note',
          source_url: 'https://example.com/high',
          source_type: 'url',
        },
        {
          id: 'c-mid',
          item_id: 'i-3',
          chunk_index: 0,
          chunk_text: 'Mid relevance text',
          embedding: JSON.stringify(vMid),
          item_title: 'Mid Note',
          source_url: null,
          source_type: 'note',
        },
      ];

      vi.spyOn(chunkRepositoryModule(chunkRepo), 'getAllWithItemMetadata').mockReturnValue(mockData);

      const result = await retrieveRelevantChunks('query', {
        queryVector: vQuery,
        threshold: 0.40,
        topK: 5,
      });

      expect(result.hasContext).toBe(true);
      expect(result.chunks).toHaveLength(2); // c-high and c-mid pass 0.40; c-low (0.0) is filtered
      expect(result.chunks[0].id).toBe('c-high');
      expect(result.chunks[0].label).toBe('S1');
      expect(result.chunks[1].id).toBe('c-mid');
      expect(result.chunks[1].label).toBe('S2');
    });

    it('gracefully skips chunks with malformed embeddings without throwing', async () => {
      const vQuery = Array(384).fill(0.1);
      const mockData = [
        {
          id: 'c-bad',
          item_id: 'i-bad',
          chunk_index: 0,
          chunk_text: 'Bad chunk',
          embedding: '{ not valid json array }',
          item_title: 'Bad Note',
        },
      ];
      vi.spyOn(chunkRepositoryModule(chunkRepo), 'getAllWithItemMetadata').mockReturnValue(mockData);

      const result = await retrieveRelevantChunks('query', { queryVector: vQuery });
      expect(result.chunks).toEqual([]);
      expect(result.hasContext).toBe(false);
    });
  });

  describe('executeQuery end-to-end', () => {
    it('short-circuits and skips LLM when no chunks pass threshold', async () => {
      const mockLlmClient = {
        chat: {
          completions: {
            create: vi.fn(),
          },
        },
      };

      vi.spyOn(chunkRepositoryModule(chunkRepo), 'getAllWithItemMetadata').mockReturnValue([]);

      const response = await executeQuery('obscure question', {
        queryVector: Array(384).fill(0.1),
        llmClientOverride: mockLlmClient,
      });

      expect(response.answer).toBe(INSUFFICIENT_CONTEXT_MESSAGE);
      expect(response.sources).toEqual([]);
      // Ensure Groq completion was never called!
      expect(mockLlmClient.chat.completions.create).not.toHaveBeenCalled();
    });

    it('maps valid citations and drops invented citations', async () => {
      const v = Array(384).fill(0.1);
      const mockData = [
        {
          id: 'c-1',
          item_id: 'item-1',
          chunk_index: 0,
          chunk_text: 'PostgreSQL supports vector indexes like HNSW.',
          embedding: JSON.stringify(v),
          item_title: 'Postgres Guide',
          source_url: 'https://postgres.org',
          source_type: 'url',
        },
      ];
      vi.spyOn(chunkRepositoryModule(chunkRepo), 'getAllWithItemMetadata').mockReturnValue(mockData);

      const mockLlmClient = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      answer: 'Postgres supports HNSW vectors.',
                      sources: ['S1', 'S99_INVENTED'],
                    }),
                  },
                },
              ],
            }),
          },
        },
      };

      const response = await executeQuery('vector indexes', {
        queryVector: v,
        threshold: 0.1,
        llmClientOverride: mockLlmClient,
      });

      expect(response.answer).toBe('Postgres supports HNSW vectors.');
      expect(response.sources).toHaveLength(1);
      expect(response.sources[0].id).toBe('item-1');
      expect(response.sources[0].label).toBe('S1');
      expect(response.sources[0].title).toBe('Postgres Guide');
      expect(response.sources[0].url).toBe('https://postgres.org');
    });

    it('throws GroqServiceError (502) if Groq API call fails', async () => {
      const v = Array(384).fill(0.1);
      const mockData = [
        {
          id: 'c-1',
          item_id: 'item-1',
          chunk_index: 0,
          chunk_text: 'Sample text',
          embedding: JSON.stringify(v),
          item_title: 'Sample',
        },
      ];
      vi.spyOn(chunkRepositoryModule(chunkRepo), 'getAllWithItemMetadata').mockReturnValue(mockData);

      const failingClient = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Groq rate limit or connection timeout')),
          },
        },
      };

      await expect(
        executeQuery('test', {
          queryVector: v,
          threshold: 0.1,
          llmClientOverride: failingClient,
        })
      ).rejects.toThrow(GroqServiceError);
    });
  });
});

// Helper to spy on default exported chunkRepository
import { chunkRepository } from '../src/db/repositories/chunkRepository.js';
function chunkRepositoryModule() {
  return chunkRepository;
}
