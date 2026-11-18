import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../src/db/connection.js';
import { ItemRepository, itemRepository } from '../src/db/repositories/itemRepository.js';
import { ChunkRepository, chunkRepository } from '../src/db/repositories/chunkRepository.js';
import { processItem, queueIngestion } from '../src/services/ingestionService.js';
import * as extractionService from '../src/services/extractionService.js';
import * as embeddingService from '../src/services/embeddingService.js';

describe('Ingestion Service Flow', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);

    // Patch repos to use memory db for tests
    vi.spyOn(itemRepository, 'db', 'get').mockReturnValue(db);
    vi.spyOn(chunkRepository, 'db', 'get').mockReturnValue(db);

    // Mock embedding generation to return fixed vectors for speed
    vi.spyOn(embeddingService, 'embedBatch').mockResolvedValue([
      Array(384).fill(0.05),
      Array(384).fill(0.06),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
  });

  it('successfully ingests a plain-text note to completion', async () => {
    const item = await queueIngestion({
      sourceType: 'note',
      content: 'Antigravity is an advanced agentic framework.',
      title: 'Agentic Frameworks',
    });

    expect(item.processing_status).toBe('pending');

    // Run processing
    await processItem(item.id);

    const completed = itemRepository.findById(item.id);
    expect(completed.processing_status).toBe('completed');
    expect(completed.content_hash).toBeDefined();
    expect(completed.error_message).toBeNull();

    const chunks = chunkRepository.findByItemId(item.id);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].chunk_text).toContain('Antigravity');
  });

  it('marks item as failed when URL fetching or extraction fails', async () => {
    vi.spyOn(extractionService, 'fetchUrlSafely').mockRejectedValue(
      new Error('SSRF blocked: restricted private IP')
    );

    const item = await queueIngestion({
      sourceType: 'url',
      url: 'http://169.254.169.254/secret',
      title: 'Metadata attempt',
    });

    await processItem(item.id);

    const failed = itemRepository.findById(item.id);
    expect(failed.processing_status).toBe('failed');
    expect(failed.error_message).toContain('SSRF blocked');

    const chunks = chunkRepository.findByItemId(item.id);
    expect(chunks).toHaveLength(0);
  });

  it('reuses chunk embeddings on deduplication match', async () => {
    const content = 'Exact duplicate text content to verify deduplication.';
    const item1 = await queueIngestion({
      sourceType: 'note',
      content,
      title: 'Note 1',
    });
    await processItem(item1.id);

    const embedSpy = vi.spyOn(embeddingService, 'embedBatch');
    embedSpy.mockClear();

    const item2 = await queueIngestion({
      sourceType: 'note',
      content,
      title: 'Note 2',
    });
    await processItem(item2.id);

    const completed2 = itemRepository.findById(item2.id);
    expect(completed2.processing_status).toBe('completed');
    expect(completed2.content_hash).toBe(itemRepository.findById(item1.id).content_hash);

    // EmbedBatch should not have been called for item2 because of dedup!
    expect(embedSpy).not.toHaveBeenCalled();

    const chunks2 = chunkRepository.findByItemId(item2.id);
    expect(chunks2.length).toBeGreaterThan(0);
  });
});
