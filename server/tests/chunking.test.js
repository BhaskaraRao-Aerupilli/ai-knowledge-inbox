import { describe, it, expect } from 'vitest';
import { chunkText, estimateTokens, splitIntoSentences } from '../src/services/chunkingService.js';

describe('Chunking Service', () => {
  it('handles empty, null, or whitespace-only input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText(null)).toEqual([]);
    expect(chunkText(undefined)).toEqual([]);
    expect(chunkText('   \n\t  ')).toEqual([]);
    expect(estimateTokens('')).toBe(0);
  });

  it('keeps short text under chunk size in a single chunk', () => {
    const text = 'This is a short note that easily fits in one chunk.';
    const chunks = chunkText(text, { maxTokens: 200, overlapTokens: 40 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('preserves sentence order and determinism across multiple runs', () => {
    const sentences = [
      'The first sentence introduces the topic.',
      'The second sentence adds crucial detail.',
      'The third sentence provides examples.',
      'The fourth sentence elaborates further.',
      'The fifth sentence draws conclusions.',
    ];
    const text = sentences.join(' ');

    const run1 = chunkText(text, { maxTokens: 15, overlapTokens: 5 });
    const run2 = chunkText(text, { maxTokens: 15, overlapTokens: 5 });

    expect(run1).toEqual(run2);
    expect(run1.length).toBeGreaterThan(1);
    expect(run1[0]).toContain('first sentence');
    expect(run1[run1.length - 1]).toContain('conclusions');
  });

  it('includes overlap between consecutive chunks', () => {
    const text = [
      'Sentence one provides the premise.',
      'Sentence two develops the argument in detail with several points.',
      'Sentence three adds further analysis on the subject matter.',
      'Sentence four concludes the section with key insights.',
    ].join(' ');

    const chunks = chunkText(text, { maxTokens: 20, overlapTokens: 10 });
    expect(chunks.length).toBeGreaterThan(1);

    // Verify consecutive chunks share overlapping words/sentences
    for (let i = 1; i < chunks.length; i++) {
      const prevWords = new Set(chunks[i - 1].split(/\s+/));
      const currWords = chunks[i].split(/\s+/);
      const overlapFound = currWords.some((w) => prevWords.has(w) && w.length > 3);
      expect(overlapFound).toBe(true);
    }
  });

  it('splits single very long sentences exceeding maxTokens', () => {
    const veryLongSentence = Array(100).fill('word').join(' ') + '.';
    const chunks = chunkText(veryLongSentence, { maxTokens: 20, overlapTokens: 5 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(estimateTokens(chunk)).toBeLessThanOrEqual(30);
    }
  });
});
