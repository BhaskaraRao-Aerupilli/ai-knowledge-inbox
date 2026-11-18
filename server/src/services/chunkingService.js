import { config } from '../config/index.js';

/**
 * Estimates token count using words * 1.3 heuristic.
 * This is calibrated for English text with subword tokenizers (like WordPiece/BPE)
 * where 1 word is roughly 1.3 tokens on average.
 *
 * @param {string} text
 * @returns {number} estimated token count
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  return Math.ceil(words.length * 1.3);
}

/**
 * Splits text into sentence fragments while preserving delimiters.
 * Handles periods, exclamation marks, question marks, and newlines.
 *
 * @param {string} text
 * @returns {string[]} array of sentences
 */
export function splitIntoSentences(text) {
  if (!text || typeof text !== 'string') return [];
  // Match sentences ending in punctuation or newlines
  const rawSentences = text
    .replace(/([.?!])\s+/g, '$1\n')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return rawSentences;
}

/**
 * Splits long sentences that exceed maxTokens into word-level subchunks.
 *
 * @param {string} sentence
 * @param {number} targetTokens
 * @returns {string[]}
 */
function splitLongSentence(sentence, targetTokens) {
  const words = sentence.trim().split(/\s+/).filter(Boolean);
  const maxWords = Math.max(1, Math.floor(targetTokens / 1.3));
  const subchunks = [];

  for (let i = 0; i < words.length; i += maxWords) {
    subchunks.push(words.slice(i, i + maxWords).join(' '));
  }
  return subchunks;
}

/**
 * Sentence-aware, deterministic text chunker with configurable token budget and overlap.
 * MiniLM truncates input beyond ~256 tokens, so 200 tokens with 40 token overlap ensures
 * full semantic preservation without silent truncation.
 *
 * @param {string} text - Raw input text
 * @param {object} options
 * @param {number} [options.maxTokens] - Max tokens per chunk (default from config: ~200)
 * @param {number} [options.overlapTokens] - Overlap tokens between chunks (default: ~40)
 * @returns {string[]} Array of chunk text strings
 */
export function chunkText(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const maxTokens = options.maxTokens ?? config.CHUNK_SIZE ?? 200;
  const overlapTokens = options.overlapTokens ?? config.CHUNK_OVERLAP ?? 40;

  // If entire text fits in one chunk, return it immediately
  if (estimateTokens(trimmed) <= maxTokens) {
    return [trimmed];
  }

  const stepTarget = Math.max(5, maxTokens - overlapTokens);
  const rawSentences = splitIntoSentences(trimmed);
  // Expand any sentences that exceed stepTarget so chunks with overlap stay bounded
  const sentences = [];
  for (const s of rawSentences) {
    if (estimateTokens(s) > stepTarget) {
      sentences.push(...splitLongSentence(s, stepTarget));
    } else {
      sentences.push(s);
    }
  }

  const chunks = [];
  let currentSentences = [];
  let currentTokenCount = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const sentenceTokens = estimateTokens(sentence);

    // If adding this sentence would exceed budget and we already have content
    if (currentTokenCount + sentenceTokens > maxTokens && currentSentences.length > 0) {
      chunks.push(currentSentences.join(' '));

      // Calculate overlap: walk backwards from current sentences to accumulate ~overlapTokens
      const overlapSentences = [];
      let overlapCount = 0;
      for (let j = currentSentences.length - 1; j >= 0; j--) {
        const prevSentence = currentSentences[j];
        const prevTokens = estimateTokens(prevSentence);
        if (overlapCount + prevTokens <= overlapTokens || overlapSentences.length === 0) {
          overlapSentences.unshift(prevSentence);
          overlapCount += prevTokens;
        } else {
          break;
        }
      }

      currentSentences = [...overlapSentences];
      currentTokenCount = overlapCount;
    }

    currentSentences.push(sentence);
    currentTokenCount += sentenceTokens;
  }

  if (currentSentences.length > 0) {
    const lastChunk = currentSentences.join(' ');
    // Avoid creating a redundant duplicate chunk if overlap covered everything
    if (chunks.length === 0 || chunks[chunks.length - 1] !== lastChunk) {
      chunks.push(lastChunk);
    }
  }

  return chunks;
}
