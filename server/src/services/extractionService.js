import crypto from 'crypto';
import dns from 'dns/promises';
import * as cheerio from 'cheerio';
import { BadRequestError, UnprocessableError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const REQUEST_TIMEOUT_MS = 10000; // 10s
const MAX_REDIRECTS = 5;

/**
 * Checks whether an IPv4 or IPv6 address belongs to private/internal/cloud-metadata networks.
 */
export function isPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return true;

  // Handle IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }

  // IPv6 checks
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fe90:') || lower.startsWith('fea0:') || lower.startsWith('feb0:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    if (lower.startsWith('ff')) return true; // multicast
    return false;
  }

  // IPv4 checks
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // invalid IP treated as unsafe
  }

  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 10) return true; // 10.0.0.0/8 (private)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local & AWS/GCP metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (private)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (private)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (carrier-grade NAT)
  if (a >= 224) return true; // Multicast & reserved

  return false;
}

/**
 * Validates a URL against SSRF: protocol and DNS resolution against private IP ranges.
 */
export async function validateUrlSsrf(urlString) {
  let parsedUrl;
  try {
    parsedUrl = new URL(urlString);
  } catch (err) {
    throw new BadRequestError(`Invalid URL format: ${urlString}`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new BadRequestError(`Forbidden URL protocol: ${parsedUrl.protocol}. Only http and https are allowed.`);
  }

  const hostname = parsedUrl.hostname;
  if (!hostname || hostname === 'localhost') {
    throw new BadRequestError('Forbidden hostname: local/private access is disallowed');
  }

  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new BadRequestError(`Could not resolve hostname: ${hostname}`);
    }
    for (const record of addresses) {
      if (isPrivateIp(record.address)) {
        throw new BadRequestError(`SSRF blocked: ${hostname} resolves to private/restricted IP (${record.address})`);
      }
    }
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    throw new BadRequestError(`DNS resolution failed for ${hostname}: ${err.message}`);
  }

  return parsedUrl;
}

/**
 * Safely fetches URL content with SSRF checks, redirect limits, timeout, and size limits.
 */
export async function fetchUrlSafely(urlString, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS) {
    throw new BadRequestError('Too many redirects while fetching URL');
  }

  await validateUrlSsrf(urlString);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(urlString, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'AI-Knowledge-Inbox-Fetcher/1.0',
        Accept: 'text/html, text/plain;q=0.9',
      },
      redirect: 'manual',
    });

    clearTimeout(timeoutId);

    // Handle redirects manually to re-verify SSRF on each jump
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) {
        throw new BadRequestError('Redirect location header missing');
      }
      const nextUrl = new URL(location, urlString).toString();
      logger.info({ from: urlString, to: nextUrl }, 'Following redirect with SSRF re-validation');
      return fetchUrlSafely(nextUrl, redirectCount + 1);
    }

    if (!res.ok) {
      throw new BadRequestError(`HTTP error ${res.status} ${res.statusText} fetching URL`);
    }

    const contentType = res.headers.get('content-type') || '';
    const isHtml = contentType.includes('text/html');
    const isPlain = contentType.includes('text/plain');

    if (!isHtml && !isPlain) {
      throw new UnprocessableError(`Unsupported Content-Type "${contentType}". Only text/html and text/plain are supported.`);
    }

    // Stream with size cap
    const reader = res.body?.getReader();
    if (!reader) {
      throw new UnprocessableError('Empty response body');
    }

    const chunks = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      if (totalBytes > MAX_RESPONSE_SIZE) {
        throw new BadRequestError(`Response exceeded maximum size limit of ${MAX_RESPONSE_SIZE} bytes`);
      }
      chunks.push(value);
    }

    const fullBuffer = Buffer.concat(chunks);
    const bodyText = fullBuffer.toString('utf-8');

    return { text: bodyText, isHtml, url: urlString };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new BadRequestError('Request timed out while fetching URL');
    }
    throw err;
  }
}

/**
 * Extracts clean, readable text and title from HTML or plain text.
 */
export function extractContent(rawText, isHtml = true, fallbackTitle = '') {
  if (!rawText || rawText.trim().length === 0) {
    throw new UnprocessableError('Page contains no readable content');
  }

  if (!isHtml) {
    const text = rawText.trim();
    const title = fallbackTitle || text.slice(0, 50).split('\n')[0] || 'Untitled Note';
    return { title, content: text };
  }

  const $ = cheerio.load(rawText);

  // Extract title before stripping tags
  let title = $('title').first().text().trim() ||
              $('meta[property="og:title"]').attr('content')?.trim() ||
              $('h1').first().text().trim() ||
              fallbackTitle ||
              'Untitled Web Page';

  // Strip boilerplate and non-content elements
  $('script, style, nav, header, footer, aside, form, noscript, svg, iframe').remove();

  // Extract text from main content container or fallback to body
  const mainEl = $('main, article').first();
  let text = (mainEl.length > 0 ? mainEl.text() : $('body').text()).replace(/\s+/g, ' ').trim();

  // Fallback to meta description if body is empty
  if (!text) {
    const metaDesc = $('meta[name="description"]').attr('content')?.trim() ||
                     $('meta[property="og:description"]').attr('content')?.trim();
    if (metaDesc) {
      text = `${title}. ${metaDesc}`;
    }
  }

  if (!text) {
    throw new UnprocessableError('Page contains no readable text content after extraction');
  }

  return { title, content: text };
}

/**
 * Computes deterministic SHA-256 hash of content.
 */
export function computeContentHash(content) {
  if (!content) return '';
  return crypto.createHash('sha256').update(content.trim()).digest('hex');
}
