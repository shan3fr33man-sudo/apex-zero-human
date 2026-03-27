/**
 * Firecrawl Client — Shared utility for ALL APEX agents.
 *
 * Every agent has access to web scraping, crawling, search, and structured
 * extraction via Firecrawl. This client wraps the Firecrawl JS SDK and
 * provides convenience methods optimized for agent workflows.
 *
 * Usage in agents:
 *   import { scrapeToMarkdown, searchWeb } from '../lib/firecrawl.js';
 *   const page = await scrapeToMarkdown('https://example.com');
 *   const results = await searchWeb('competitor pricing');
 */

import FirecrawlApp from '@mendable/firecrawl-js';
import { createLogger } from './logger.js';

const log = createLogger('Firecrawl');

let _instance: FirecrawlApp | null = null;

/**
 * Get the singleton Firecrawl client instance.
 * Lazily initialized on first use.
 */
export function getFirecrawl(): FirecrawlApp {
  if (!_instance) {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      throw new Error('[Firecrawl] Missing FIRECRAWL_API_KEY environment variable');
    }

    _instance = new FirecrawlApp({ apiKey });
    log.info('Firecrawl client initialized');
  }
  return _instance;
}

/**
 * Quick scrape — returns clean markdown content from a URL.
 * This is the most common operation agents need.
 */
export async function scrapeToMarkdown(url: string): Promise<string> {
  const client = getFirecrawl();
  const result = await client.scrape(url, { formats: ['markdown'] });
  // SDK returns Document directly — markdown is an optional field
  return result.markdown ?? '';
}

/**
 * Quick search — searches the web and returns results.
 * Agents use this for competitor research, market analysis, lead enrichment, etc.
 */
export async function searchWeb(
  query: string,
  limit: number = 5
): Promise<Array<{ url: string; title: string; markdown: string }>> {
  const client = getFirecrawl();
  const result = await client.search(query, {
    limit,
    scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
  });

  // SearchData has web?: Array<SearchResultWeb | Document>
  const webResults = result.web ?? [];

  return webResults.map((item) => ({
    url: ('url' in item ? item.url : '') ?? '',
    title: ('title' in item ? (item.title as string) : '') ?? '',
    markdown: ('markdown' in item ? (item.markdown as string) : '') ?? '',
  }));
}

/**
 * Crawl a site — returns all pages as markdown.
 * Agents use this for deep site analysis, documentation ingestion, etc.
 */
export async function crawlSite(
  url: string,
  options: { limit?: number; maxDiscoveryDepth?: number; includePaths?: string[]; excludePaths?: string[] } = {}
): Promise<Array<{ url: string; markdown: string }>> {
  const client = getFirecrawl();
  const result = await client.crawl(url, {
    limit: options.limit ?? 50,
    maxDiscoveryDepth: options.maxDiscoveryDepth,
    includePaths: options.includePaths,
    excludePaths: options.excludePaths,
    scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
  });

  // CrawlJob has status and data: Document[]
  if (result.status === 'failed' || result.status === 'cancelled') {
    log.error('Crawl failed', { url, status: result.status });
    throw new Error(`Crawl failed for ${url} (status: ${result.status})`);
  }

  return (result.data ?? []).map((page) => ({
    url: (page.metadata?.sourceURL as string) ?? '',
    markdown: page.markdown ?? '',
  }));
}

/**
 * Map a site — discover all URLs without scraping content.
 * Fast way to understand site structure before targeted scraping.
 */
export async function mapSite(url: string, limit: number = 100): Promise<string[]> {
  const client = getFirecrawl();
  const result = await client.map(url, { limit });

  // MapData has links: SearchResultWeb[] — extract URLs
  return (result.links ?? []).map((link) => link.url);
}

/**
 * Extract structured data from URLs using LLM extraction.
 * Agents use this when they need specific data points from web pages.
 */
export async function extractStructured(
  urls: string[],
  prompt: string
): Promise<unknown> {
  const client = getFirecrawl();
  const result = await client.extract({ urls, prompt });

  if (result.success === false) {
    log.error('Extract failed', { urls });
    throw new Error('Extract failed');
  }

  return result.data;
}
