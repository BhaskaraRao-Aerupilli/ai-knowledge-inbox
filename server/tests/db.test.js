import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema, resetStuckProcessingItems } from '../src/db/connection.js';
import { ItemRepository } from '../src/db/repositories/itemRepository.js';
import { ChunkRepository } from '../src/db/repositories/chunkRepository.js';

describe('Database and Repositories', () => {
  let db;
  let itemRepo;
  let chunkRepo;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initSchema(db);
    itemRepo = new ItemRepository(db);
    chunkRepo = new ChunkRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates an item and lists items with preview', () => {
    const item = itemRepo.create({
      id: 'item-1',
      title: 'Test Note',
      content: 'This is a long content test that should be previewed properly in the items list view.',
      contentHash: 'hash-1',
      sourceType: 'note',
      processingStatus: 'completed',
    });

    expect(item).toBeDefined();
    expect(item.id).toBe('item-1');
    expect(item.title).toBe('Test Note');

    const list = itemRepo.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('item-1');
    expect(list[0].preview).toContain('This is a long content');
    // Ensure raw content and embeddings are not returned in list
    expect(list[0].content).toBeUndefined();
    expect(list[0].embedding).toBeUndefined();
  });

  it('cascades chunk deletion when an item is deleted', () => {
    itemRepo.create({
      id: 'item-del',
      title: 'To Delete',
      content: 'Some text',
      sourceType: 'note',
      processingStatus: 'completed',
    });

    chunkRepo.insertBatch([
      {
        id: 'chunk-1',
        itemId: 'item-del',
        chunkIndex: 0,
        chunkText: 'Text 1',
        embedding: JSON.stringify([0.1, 0.2]),
      },
      {
        id: 'chunk-2',
        itemId: 'item-del',
        chunkIndex: 1,
        chunkText: 'Text 2',
        embedding: JSON.stringify([0.3, 0.4]),
      },
    ]);

    expect(chunkRepo.findByItemId('item-del')).toHaveLength(2);

    itemRepo.delete('item-del');

    expect(chunkRepo.findByItemId('item-del')).toHaveLength(0);
  });

  it('resets stuck processing items on startup', () => {
    itemRepo.create({
      id: 'stuck-1',
      title: 'Stuck Item',
      content: 'Pending work',
      sourceType: 'note',
      processingStatus: 'processing',
    });

    resetStuckProcessingItems(db);

    const updated = itemRepo.findById('stuck-1');
    expect(updated.processing_status).toBe('failed');
    expect(updated.error_message).toBe('Interrupted by server restart');
  });
});
