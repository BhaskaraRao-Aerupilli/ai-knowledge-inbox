import { getDatabase } from '../connection.js';

export class ChunkRepository {
  constructor(db = null) {
    this._db = db;
  }

  get db() {
    return this._db || getDatabase();
  }

  insertBatch(chunks) {
    if (!chunks || chunks.length === 0) return [];

    const stmt = this.db.prepare(`
      INSERT INTO chunks (id, item_id, chunk_index, chunk_text, embedding, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items) => {
      for (const chunk of items) {
        stmt.run(
          chunk.id,
          chunk.itemId,
          chunk.chunkIndex,
          chunk.chunkText,
          chunk.embedding, // JSON string
          chunk.createdAt || new Date().toISOString()
        );
      }
    });

    insertMany(chunks);
    return chunks;
  }

  deleteByItemId(itemId) {
    const stmt = this.db.prepare('DELETE FROM chunks WHERE item_id = ?');
    const result = stmt.run(itemId);
    return result.changes;
  }

  findByItemId(itemId) {
    const stmt = this.db.prepare(`
      SELECT id, item_id, chunk_index, chunk_text, embedding, created_at
      FROM chunks
      WHERE item_id = ?
      ORDER BY chunk_index ASC
    `);
    return stmt.all(itemId);
  }

  getAllWithItemMetadata() {
    const stmt = this.db.prepare(`
      SELECT 
        c.id,
        c.item_id,
        c.chunk_index,
        c.chunk_text,
        c.embedding,
        i.title as item_title,
        i.source_url,
        i.source_type
      FROM chunks c
      JOIN items i ON c.item_id = i.id
      WHERE i.processing_status = 'completed'
    `);
    return stmt.all();
  }
}

export const chunkRepository = new ChunkRepository();
