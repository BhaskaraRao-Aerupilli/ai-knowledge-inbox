import { config } from '../config/index.js';
import { chunkRepository } from '../db/repositories/chunkRepository.js';
import { embedText, parseVector, cosineSimilarity } from './embeddingService.js';
import { logger } from '../utils/logger.js';

/**
 * Retrieves the top-K relevant chunks for a user question based on cosine similarity.
 *
 * @param {string} question - User question
 * @param {object} [options]
 * @param {number} [options.topK] - Max chunks to retrieve (default: 5)
 * @param {number} [options.threshold] - Minimum similarity threshold (default: 0.30)
 * @param {number[]} [options.queryVector] - Precomputed query embedding (optional, useful for tests)
 * @returns {Promise<{
 *   chunks: Array<{
 *     id: string,
 *     itemId: string,
 *     chunkIndex: number,
 *     chunkText: string,
 *     itemTitle: string,
 *     sourceUrl: string,
 *     sourceType: string,
 *     similarity: number,
 *     label: string,
 *     snippet: string
 *   }>,
 *   hasContext: boolean
 * }>}
 */
export async function retrieveRelevantChunks(question, options = {}) {
  const topK = options.topK ?? config.TOP_K ?? 5;
  const threshold = options.threshold ?? config.SIMILARITY_THRESHOLD ?? 0.30;

  const queryVector = options.queryVector || (await embedText(question));

  const allChunks = chunkRepository.getAllWithItemMetadata();
  if (!allChunks || allChunks.length === 0) {
    return { chunks: [], hasContext: false };
  }

  const scoredChunks = [];

  for (const row of allChunks) {
    const chunkVector = parseVector(row.embedding);
    if (!chunkVector) {
      logger.warn({ chunkId: row.id, itemId: row.item_id }, 'Skipping chunk with malformed embedding vector');
      continue;
    }

    const similarity = cosineSimilarity(queryVector, chunkVector);
    if (similarity === null) {
      logger.warn({ chunkId: row.id }, 'Skipping chunk due to invalid cosine similarity computation');
      continue;
    }

    if (similarity >= threshold) {
      scoredChunks.push({
        id: row.id,
        itemId: row.item_id,
        chunkIndex: row.chunk_index,
        chunkText: row.chunk_text,
        itemTitle: row.item_title || 'Untitled',
        sourceUrl: row.source_url,
        sourceType: row.source_type,
        similarity: parseFloat(similarity.toFixed(4)),
      });
    }
  }

  // Sort strictly descending by similarity
  scoredChunks.sort((a, b) => b.similarity - a.similarity);

  // Take top K results (never pad if fewer pass threshold)
  const topChunks = scoredChunks.slice(0, topK);

  // Assign citations [S1]..[Sn] and snippets
  const labeledChunks = topChunks.map((c, index) => {
    const label = `S${index + 1}`;
    const snippet = c.chunkText.length > 280 ? `${c.chunkText.slice(0, 280).trim()}...` : c.chunkText;
    return {
      ...c,
      label,
      snippet,
    };
  });

  return {
    chunks: labeledChunks,
    hasContext: labeledChunks.length > 0,
  };
}

/**
 * Formats labeled chunks into delimited, untrusted context blocks for the LLM.
 *
 * @param {Array<{label: string, chunkText: string, itemTitle: string}>} chunks
 * @returns {string} Formatted context block
 */
export function formatDelimitedContext(chunks) {
  if (!chunks || chunks.length === 0) return 'No context available.';

  return chunks
    .map(
      (c) =>
        `<<<CONTEXT_SOURCE label="${c.label}" title="${c.itemTitle}">\n${c.chunkText}\n<<<END_SOURCE>>>`
    )
    .join('\n\n');
}
