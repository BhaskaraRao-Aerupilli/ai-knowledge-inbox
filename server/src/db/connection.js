import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '../..');

let dbInstance = null;

export function getDatabase(dbPath = config.DATABASE_PATH) {
  if (dbInstance) {
    return dbInstance;
  }

  const resolvedPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(SERVER_ROOT, dbPath);
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  logger.info({ path: resolvedPath }, 'Initializing SQLite database');
  const db = new Database(resolvedPath);

  // Configure pragmas
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  initSchema(db);

  // Recovery: reset stuck 'processing' items on startup
  resetStuckProcessingItems(db);

  dbInstance = db;
  return db;
}

export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      title TEXT,
      content TEXT,
      content_hash TEXT,
      source_type TEXT CHECK(source_type IN ('note', 'url')) NOT NULL,
      source_url TEXT,
      processing_status TEXT CHECK(processing_status IN ('pending', 'processing', 'completed', 'failed')) NOT NULL DEFAULT 'pending',
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      chunk_text TEXT NOT NULL,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_item_id ON chunks(item_id);
    CREATE INDEX IF NOT EXISTS idx_items_content_hash ON items(content_hash);
  `);
}

export function resetStuckProcessingItems(db) {
  const stmt = db.prepare(`
    UPDATE items
    SET processing_status = 'failed',
        error_message = 'Interrupted by server restart',
        updated_at = ?
    WHERE processing_status = 'processing'
  `);
  const info = stmt.run(new Date().toISOString());
  if (info.changes > 0) {
    logger.warn({ count: info.changes }, 'Reset stuck processing items to failed state on startup');
  }
}

export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
