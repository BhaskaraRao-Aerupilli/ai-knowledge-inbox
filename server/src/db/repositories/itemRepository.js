import { getDatabase } from '../connection.js';

export class ItemRepository {
  constructor(db = null) {
    this._db = db;
  }

  get db() {
    return this._db || getDatabase();
  }

  create({ id, title, content, contentHash, sourceType, sourceUrl, processingStatus = 'pending' }) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO items (
        id, title, content, content_hash, source_type, source_url, processing_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, title || null, content || null, contentHash || null, sourceType, sourceUrl || null, processingStatus, now, now);
    return this.findById(id);
  }

  findById(id) {
    const stmt = this.db.prepare(`
      SELECT id, title, content, content_hash, source_type, source_url,
             processing_status, error_message, created_at, updated_at
      FROM items
      WHERE id = ?
    `);
    return stmt.get(id) || null;
  }

  findByContentHash(contentHash) {
    if (!contentHash) return null;
    const stmt = this.db.prepare(`
      SELECT id, title, content, content_hash, source_type, source_url,
             processing_status, error_message, created_at, updated_at
      FROM items
      WHERE content_hash = ? AND processing_status = 'completed'
      LIMIT 1
    `);
    return stmt.get(contentHash) || null;
  }

  list({ limit = 50, offset = 0 } = {}) {
    // Requirements: "latest first, never returns embeddings or full content (include a short preview); optional limit/offset"
    const stmt = this.db.prepare(`
      SELECT 
        i.id,
        i.title,
        CASE 
          WHEN LENGTH(i.content) > 160 THEN SUBSTR(i.content, 1, 160) || '...'
          ELSE i.content 
        END as preview,
        i.source_type,
        i.source_url,
        i.processing_status,
        i.error_message,
        i.created_at,
        i.updated_at,
        COUNT(c.id) as chunk_count
      FROM items i
      LEFT JOIN chunks c ON i.id = c.item_id
      GROUP BY i.id
      ORDER BY datetime(i.created_at) DESC
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset);
  }

  updateStatus(id, status, errorMessage = null, additionalFields = {}) {
    const now = new Date().toISOString();
    const setClauses = ['processing_status = ?', 'error_message = ?', 'updated_at = ?'];
    const values = [status, errorMessage, now];

    if (additionalFields.content !== undefined) {
      setClauses.push('content = ?');
      values.push(additionalFields.content);
    }
    if (additionalFields.title !== undefined) {
      setClauses.push('title = ?');
      values.push(additionalFields.title);
    }
    if (additionalFields.contentHash !== undefined) {
      setClauses.push('content_hash = ?');
      values.push(additionalFields.contentHash);
    }

    values.push(id);
    const sql = `UPDATE items SET ${setClauses.join(', ')} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values);
    return this.findById(id);
  }

  delete(id) {
    const stmt = this.db.prepare('DELETE FROM items WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  hasPendingOrProcessing() {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count 
      FROM items 
      WHERE processing_status IN ('pending', 'processing')
    `);
    const row = stmt.get();
    return (row?.count || 0) > 0;
  }
}

export const itemRepository = new ItemRepository();
