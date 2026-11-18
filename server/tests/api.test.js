import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../src/app.js';
import { initSchema } from '../src/db/connection.js';
import { itemRepository } from '../src/db/repositories/itemRepository.js';
import { chunkRepository } from '../src/db/repositories/chunkRepository.js';
import * as queryService from '../src/services/queryService.js';
import * as ingestionService from '../src/services/ingestionService.js';
import { GroqServiceError } from '../src/utils/errors.js';

describe('API Endpoints Integration Tests', () => {
  let app;
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);

    vi.spyOn(itemRepository, 'db', 'get').mockReturnValue(db);
    vi.spyOn(chunkRepository, 'db', 'get').mockReturnValue(db);

    app = createApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  describe('GET /health', () => {
    it('returns 200 with status and model metadata', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
      expect(res.body.data.models.llm).toBeDefined();
      expect(res.body.data.models.embeddings).toContain('all-MiniLM-L6-v2');
    });
  });

  describe('POST /ingest', () => {
    it('returns 202 Accepted when submitting a valid plain note', async () => {
      vi.spyOn(ingestionService, 'processItem').mockResolvedValue();

      const res = await request(app)
        .post('/ingest')
        .send({
          source_type: 'note',
          title: 'Architecture Decision',
          content: 'We use SQLite in WAL mode with normalized vector embeddings.',
        });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.processing_status).toBe('pending');
      expect(res.body.data.title).toBe('Architecture Decision');
    });

    it('returns 202 Accepted when submitting a valid URL', async () => {
      vi.spyOn(ingestionService, 'processItem').mockResolvedValue();

      const res = await request(app)
        .post('/ingest')
        .send({
          source_type: 'url',
          url: 'https://example.com/docs',
          title: 'Docs page',
        });

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.source_url).toBe('https://example.com/docs');
    });

    it('returns 400 Bad Request on missing source_type or content', async () => {
      const res1 = await request(app).post('/ingest').send({});
      expect(res1.status).toBe(400);
      expect(res1.body.success).toBe(false);
      expect(res1.body.error.code).toBe('BAD_REQUEST');

      const res2 = await request(app).post('/ingest').send({ source_type: 'note', content: '' });
      expect(res2.status).toBe(400);
      expect(res2.body.success).toBe(false);

      const res3 = await request(app).post('/ingest').send({ source_type: 'url', url: 'not-a-valid-url' });
      expect(res3.status).toBe(400);
      expect(res3.body.success).toBe(false);
    });
  });

  describe('GET /items', () => {
    it('returns list of items with preview and without raw embeddings', async () => {
      itemRepository.create({
        id: 'test-1',
        title: 'Preview Item',
        content: 'Long content that should be previewed only.',
        sourceType: 'note',
        processingStatus: 'completed',
      });

      const res = await request(app).get('/items');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('test-1');
      expect(res.body.data[0].preview).toBeDefined();
      expect(res.body.data[0].content).toBeUndefined();
      expect(res.body.data[0].embedding).toBeUndefined();
    });

    it('supports limit and offset pagination', async () => {
      for (let i = 0; i < 5; i++) {
        itemRepository.create({
          id: `item-${i}`,
          title: `Item ${i}`,
          content: `Content ${i}`,
          sourceType: 'note',
        });
      }

      const res = await request(app).get('/items?limit=2&offset=1');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.limit).toBe(2);
      expect(res.body.meta.offset).toBe(1);
    });
  });

  describe('GET /items/:id and DELETE /items/:id', () => {
    it('returns full item with chunks on GET /items/:id', async () => {
      itemRepository.create({
        id: 'item-detail',
        title: 'Detailed Item',
        content: 'Full content',
        sourceType: 'note',
        processingStatus: 'completed',
      });

      const res = await request(app).get('/items/item-detail');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('item-detail');
      expect(res.body.data.content).toBe('Full content');
    });

    it('returns 404 on nonexistent item', async () => {
      const res = await request(app).get('/items/nonexistent-id');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('deletes item and cascades chunks on DELETE /items/:id', async () => {
      itemRepository.create({
        id: 'item-to-delete',
        title: 'Delete Me',
        content: 'Content',
        sourceType: 'note',
      });

      const res = await request(app).delete('/items/item-to-delete');
      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);

      expect(itemRepository.findById('item-to-delete')).toBeNull();
    });
  });

  describe('POST /query', () => {
    it('returns 400 on empty or missing question', async () => {
      const res = await request(app).post('/query').send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('returns 200 with answer and citations on valid query', async () => {
      vi.spyOn(queryService, 'executeQuery').mockResolvedValue({
        answer: 'SQLite is used for storage.',
        sources: [
          {
            id: 'item-1',
            title: 'DB Architecture',
            snippet: 'SQLite is used for storage.',
            similarity: 0.85,
            label: 'S1',
          },
        ],
      });

      const res = await request(app)
        .post('/query')
        .send({ question: 'What database is used?' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.answer).toBe('SQLite is used for storage.');
      expect(res.body.data.sources).toHaveLength(1);
    });

    it('returns 502 when Groq LLM service fails', async () => {
      vi.spyOn(queryService, 'executeQuery').mockRejectedValue(
        new GroqServiceError('Upstream Groq API connection failure')
      );

      const res = await request(app)
        .post('/query')
        .send({ question: 'Test question triggering Groq error' });

      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('GROQ_FAILURE');
      expect(res.body.error.message).toContain('Upstream Groq API connection failure');
    });
  });
});
