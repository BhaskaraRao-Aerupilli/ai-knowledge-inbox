import { describe, it, expect } from 'vitest';
import {
  isPrivateIp,
  validateUrlSsrf,
  extractContent,
  computeContentHash,
} from '../src/services/extractionService.js';
import { BadRequestError, UnprocessableError } from '../src/utils/errors.js';

describe('Extraction and SSRF Validation Service', () => {
  describe('isPrivateIp', () => {
    it('correctly identifies private and loopback IPv4 addresses', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('10.0.0.5')).toBe(true);
      expect(isPrivateIp('192.168.1.1')).toBe(true);
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('172.31.255.255')).toBe(true);
      expect(isPrivateIp('169.254.169.254')).toBe(true); // AWS/GCP metadata
      expect(isPrivateIp('0.0.0.0')).toBe(true);
    });

    it('correctly identifies private IPv6 addresses', () => {
      expect(isPrivateIp('::1')).toBe(true);
      expect(isPrivateIp('fe80::1')).toBe(true);
      expect(isPrivateIp('fc00::1')).toBe(true);
      expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    });

    it('allows valid public IP addresses', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false);
      expect(isPrivateIp('1.1.1.1')).toBe(false);
      expect(isPrivateIp('93.184.216.34')).toBe(false);
    });
  });

  describe('validateUrlSsrf', () => {
    it('rejects unsupported protocols', async () => {
      await expect(validateUrlSsrf('ftp://example.com/file')).rejects.toThrow(BadRequestError);
      await expect(validateUrlSsrf('file:///etc/passwd')).rejects.toThrow(BadRequestError);
      await expect(validateUrlSsrf('javascript:alert(1)')).rejects.toThrow(BadRequestError);
    });

    it('rejects localhost and private IPs', async () => {
      await expect(validateUrlSsrf('http://localhost:3000')).rejects.toThrow(BadRequestError);
      await expect(validateUrlSsrf('http://127.0.0.1')).rejects.toThrow(BadRequestError);
      await expect(validateUrlSsrf('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
        BadRequestError
      );
    });

    it('allows valid public URLs', async () => {
      const parsed = await validateUrlSsrf('https://example.com');
      expect(parsed.hostname).toBe('example.com');
      expect(parsed.protocol).toBe('https:');
    });
  });

  describe('extractContent', () => {
    it('extracts title and main text while stripping unwanted HTML elements', () => {
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Test Page Title</title>
            <style>body { color: red; }</style>
          </head>
          <body>
            <header><nav>Home | About</nav></header>
            <main>
              <h1>Main Headline</h1>
              <p>This is the actual article content that should be indexed.</p>
            </main>
            <aside>Related Links</aside>
            <footer>Copyright 2026</footer>
            <script>console.log('malicious script');</script>
          </body>
        </html>
      `;

      const result = extractContent(html, true);
      expect(result.title).toBe('Test Page Title');
      expect(result.content).toContain('Main Headline');
      expect(result.content).toContain('This is the actual article content that should be indexed.');
      expect(result.content).not.toContain('Home | About');
      expect(result.content).not.toContain('Copyright 2026');
      expect(result.content).not.toContain('malicious script');
    });

    it('falls back to title and meta description when body text is absent', () => {
      const html = `
        <html>
          <head>
            <title>Meta Fallback Title</title>
            <meta name="description" content="A concise summary of the article." />
          </head>
          <body>
            <script>loadApp();</script>
          </body>
        </html>
      `;

      const result = extractContent(html, true);
      expect(result.title).toBe('Meta Fallback Title');
      expect(result.content).toContain('A concise summary of the article.');
    });

    it('throws UnprocessableError when content is completely empty or has no readable text', () => {
      expect(() => extractContent('', false)).toThrow(UnprocessableError);
      expect(() => extractContent('<html><body><script></script></body></html>', true)).toThrow(
        UnprocessableError
      );
    });

    it('handles plain text cleanly', () => {
      const plain = 'Note line 1.\nNote line 2 with important details.';
      const result = extractContent(plain, false, 'My Plain Note');
      expect(result.title).toBe('My Plain Note');
      expect(result.content).toBe(plain);
    });
  });

  describe('computeContentHash', () => {
    it('generates consistent SHA-256 hash for identical content', () => {
      const text = 'Deterministic content for hashing test.';
      const hash1 = computeContentHash(text);
      const hash2 = computeContentHash(text);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // sha256 hex string length
    });

    it('generates different hash for different content', () => {
      expect(computeContentHash('A')).not.toBe(computeContentHash('B'));
    });
  });
});
