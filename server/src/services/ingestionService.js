import crypto from 'crypto';
import { itemRepository } from '../db/repositories/itemRepository.js';
import { chunkRepository } from '../db/repositories/chunkRepository.js';
import { fetchUrlSafely, extractContent, computeContentHash } from './extractionService.js';
import { chunkText } from './chunkingService.js';
import { embedBatch } from './embeddingService.js';
import { BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Creates an item record with 'pending' status and kicks off background processing.
 */
export async function queueIngestion({ sourceType, content, url, title }) {
  if (sourceType !== 'note' && sourceType !== 'url') {
    throw new BadRequestError('Invalid source_type. Must be "note" or "url".');
  }

  if (sourceType === 'note' && (!content || content.trim().length === 0)) {
    throw new BadRequestError('Content is required for note ingestion.');
  }

  if (sourceType === 'url' && (!url || url.trim().length === 0)) {
    throw new BadRequestError('URL is required for URL ingestion.');
  }

  const id = crypto.randomUUID();
  const rawTitle = title?.trim() || (sourceType === 'note' ? content.trim().slice(0, 40) : url.trim());

  const item = itemRepository.create({
    id,
    title: rawTitle,
    content: sourceType === 'note' ? content : null,
    sourceType,
    sourceUrl: sourceType === 'url' ? url.trim() : null,
    processingStatus: 'pending',
  });

  // Launch asynchronous background processing
  setImmediate(() => {
    processItem(id).catch((err) => {
      logger.error({ itemId: id, err: err.message }, 'Unhandled error in background item processing');
    });
  });

  return item;
}

/**
 * Executes the full ingestion pipeline for an item:
 * 1. Mark 'processing'
 * 2. Fetch/extract content & title
 * 3. Hash & check dedup
 * 4. Chunk & embed
 * 5. Save chunks & mark 'completed' (or 'failed' on error)
 */
export async function processItem(itemId) {
  const item = itemRepository.findById(itemId);
  if (!item) {
    logger.warn({ itemId }, 'Cannot process item: record not found');
    return;
  }

  itemRepository.updateStatus(itemId, 'processing');
  logger.info({ itemId, type: item.source_type }, 'Processing knowledge item');

  try {
    let rawText = '';
    let isHtml = false;
    let fallbackTitle = item.title;

    if (item.source_type === 'url') {
      const fetched = await fetchUrlSafely(item.source_url);
      rawText = fetched.text;
      isHtml = fetched.isHtml;
    } else {
      rawText = item.content || '';
      isHtml = false;
    }

    const extracted = extractContent(rawText, isHtml, fallbackTitle);
    const contentHash = computeContentHash(extracted.content);

    // Dedup check: if unchanged content exists, reuse existing embeddings
    const existing = itemRepository.findByContentHash(contentHash);
    if (existing && existing.id !== itemId) {
      const existingChunks = chunkRepository.findByItemId(existing.id);
      if (existingChunks.length > 0) {
        logger.info({ itemId, existingItemId: existing.id }, 'Dedup match: reusing existing chunk embeddings');
        const clonedChunks = existingChunks.map((c) => ({
          id: crypto.randomUUID(),
          itemId,
          chunkIndex: c.chunk_index,
          chunkText: c.chunk_text,
          embedding: c.embedding,
        }));
        chunkRepository.insertBatch(clonedChunks);
        itemRepository.updateStatus(itemId, 'completed', null, {
          title: extracted.title,
          content: extracted.content,
          contentHash,
        });
        return;
      }
    }

    // Chunk text
    const textChunks = chunkText(extracted.content);
    if (textChunks.length === 0) {
      throw new Error('No valid chunks generated from content');
    }

    // Embed all chunks
    logger.info({ itemId, chunkCount: textChunks.length }, 'Generating chunk embeddings');
    const embeddings = await embedBatch(textChunks);

    const chunkRecords = textChunks.map((chunkText, idx) => ({
      id: crypto.randomUUID(),
      itemId,
      chunkIndex: idx,
      chunkText,
      embedding: JSON.stringify(embeddings[idx]),
    }));

    // Store chunks in database
    chunkRepository.insertBatch(chunkRecords);

    // Mark completed
    itemRepository.updateStatus(itemId, 'completed', null, {
      title: extracted.title,
      content: extracted.content,
      contentHash,
    });
    logger.info({ itemId, chunkCount: chunkRecords.length }, 'Successfully ingested item');
  } catch (err) {
    logger.error({ itemId, err: err.message }, 'Failed to ingest item');
    itemRepository.updateStatus(itemId, 'failed', err.message);
  }
}
