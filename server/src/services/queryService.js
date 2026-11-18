import { retrieveRelevantChunks } from './retrievalService.js';
import { generateRAGAnswer } from './llmService.js';
import { BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const INSUFFICIENT_CONTEXT_MESSAGE =
  'The saved knowledge base does not contain enough information to answer this question.';

/**
 * Handles end-to-end question answering pipeline:
 * 1. Validate query
 * 2. Retrieve top-K chunks above threshold
 * 3. Short-circuit if no relevant context (without calling LLM)
 * 4. Call Groq with delimited context
 * 5. Validate citations defensively against retrieved chunks
 *
 * @param {string} question
 * @param {object} [options]
 * @param {object} [options.llmClientOverride] - Injected client for unit testing
 * @returns {Promise<{ answer: string, sources: Array }>}
 */
export async function executeQuery(question, options = {}) {
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    throw new BadRequestError('Question is required and must not be empty.');
  }

  const trimmedQuestion = question.trim();
  logger.info({ question: trimmedQuestion }, 'Processing knowledge query');

  // 1. Retrieve relevant chunks
  const retrieval = await retrieveRelevantChunks(trimmedQuestion, options);

  // 2. Short-circuit if no chunks meet threshold
  if (!retrieval.hasContext || retrieval.chunks.length === 0) {
    logger.info('No chunks passed similarity threshold. Returning insufficient context without LLM call.');
    return {
      answer: INSUFFICIENT_CONTEXT_MESSAGE,
      sources: [],
    };
  }

  // 3. Generate answer via Groq LLM
  const llmResult = await generateRAGAnswer(
    trimmedQuestion,
    retrieval.chunks,
    options.llmClientOverride
  );

  // 4. Map and validate citations defensively
  const chunkMap = new Map();
  for (const chunk of retrieval.chunks) {
    chunkMap.set(chunk.label, chunk);
  }

  const validSources = [];
  const seenIds = new Set();

  for (const rawLabel of llmResult.sources) {
    const normalizedLabel = rawLabel.replace(/[\[\]]/g, '').trim();
    const matchedChunk = chunkMap.get(normalizedLabel);

    if (matchedChunk) {
      if (!seenIds.has(matchedChunk.id)) {
        seenIds.add(matchedChunk.id);
        validSources.push({
          id: matchedChunk.itemId,
          chunkId: matchedChunk.id,
          title: matchedChunk.itemTitle,
          url: matchedChunk.sourceUrl,
          sourceType: matchedChunk.sourceType,
          snippet: matchedChunk.snippet,
          similarity: matchedChunk.similarity,
          label: matchedChunk.label,
        });
      }
    } else {
      logger.warn({ unknownLabel: rawLabel }, 'Dropping unrecognized citation label invented by LLM');
    }
  }

  return {
    answer: llmResult.answer,
    sources: validSources,
  };
}
