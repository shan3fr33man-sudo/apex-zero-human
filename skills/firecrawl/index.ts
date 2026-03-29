/**
 * Firecrawl Skill — Built-in
 *
 * Web scraping, crawling, search, structured extraction, and site mapping
 * powered by Firecrawl (api.firecrawl.dev). Every APEX agent can use this
 * skill for web research, competitor monitoring, lead enrichment, content
 * extraction, and any task that needs web data.
 *
 * All inputs are Zod-validated. All outputs are standardized SkillResult.
 * API key is injected via config.FIRECRAWL_API_KEY — never hardcoded.
 *
 * Permissions: network.firecrawl
 * Config: FIRECRAWL_API_KEY
 */

import type { ApexSkill, SkillResult } from '../../packages/shared/skill-interface.js';
import { z } from 'zod';

// ---- Zod Input Schemas ----

const ScrapeInputSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  formats: z.array(z.enum([
    'markdown', 'html', 'rawHtml', 'links',
    'screenshot', 'screenshot@fullPage',
  ])).optional().default(['markdown']),
  only_main_content: z.boolean().optional().default(true),
  wait_for: z.string().optional(),
  timeout: z.number().int().min(1000).max(120_000).optional().default(30_000),
  include_tags: z.array(z.string()).optional(),
  exclude_tags: z.array(z.string()).optional(),
  actions: z.array(z.record(z.unknown())).optional(),
});

const CrawlInputSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  limit: z.number().int().min(1).max(500).optional().default(50),
  max_depth: z.number().int().min(1).max(10).optional(),
  formats: z.array(z.string()).optional().default(['markdown']),
  only_main_content: z.boolean().optional().default(true),
  include_paths: z.array(z.string()).optional(),
  exclude_paths: z.array(z.string()).optional(),
});

const SearchInputSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  limit: z.number().int().min(1).max(20).optional().default(5),
  lang: z.string().optional(),
  country: z.string().optional(),
  formats: z.array(z.string()).optional().default(['markdown']),
  only_main_content: z.boolean().optional().default(true),
});

const ExtractInputSchema = z.object({
  urls: z.array(z.string().url()).min(1, 'At least one URL is required'),
  prompt: z.string().min(1, 'Extraction prompt is required'),
  schema: z.record(z.unknown()).optional(),
});

const MapInputSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  limit: z.number().int().min(1).max(5000).optional().default(100),
  search: z.string().optional(),
});

const CrawlStatusInputSchema = z.object({
  crawl_id: z.string().min(1, 'Crawl ID is required'),
});

// ---- Skill Class ----

export class FirecrawlSkill implements ApexSkill {
  readonly name = 'firecrawl';
  readonly version = '1.0.0';
  readonly permissions = ['network.firecrawl'];
  readonly description = 'Web scraping, crawling, search, structured extraction, and site mapping via Firecrawl';

  private config: Record<string, string> = {};
  private apiKey: string = '';
  private baseUrl: string = 'https://api.firecrawl.dev/v1';

  async initialize(config: Record<string, string>): Promise<void> {
    this.config = config;
    this.apiKey = config.FIRECRAWL_API_KEY ?? '';
    this.baseUrl = config.FIRECRAWL_BASE_URL ?? 'https://api.firecrawl.dev/v1';
  }

  async execute(method: string, params: Record<string, unknown>): Promise<SkillResult> {
    if (!this.apiKey) {
      return {
        success: false,
        error: 'FIRECRAWL_API_KEY not configured. Add it to company skill config.',
        error_code: 'CONFIG_MISSING',
      };
    }

    switch (method) {
      case 'scrape':
        return this.scrape(params);
      case 'crawl':
        return this.crawl(params);
      case 'crawlStatus':
        return this.crawlStatus(params);
      case 'search':
        return this.search(params);
      case 'extract':
        return this.extract(params);
      case 'map':
        return this.map(params);
      default:
        return {
          success: false,
          error: `Unknown method: ${method}. Available: scrape, crawl, crawlStatus, search, extract, map`,
          error_code: 'UNKNOWN_METHOD',
        };
    }
  }

  async shutdown(): Promise<void> {
    // No persistent resources
  }

  // ---- API Helpers ----

  private async firecrawlRequest(
    endpoint: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  }

  private formatError(status: number, data: unknown): string {
    const errorData = data as Record<string, unknown>;
    return `Firecrawl API error ${status}: ${errorData.error ?? errorData.message ?? 'Unknown error'}`;
  }

  // ---- Methods ----

  /**
   * Scrape a single URL. Returns clean markdown, HTML, links, screenshots, or metadata.
   */
  private async scrape(params: Record<string, unknown>): Promise<SkillResult> {
    const parsed = ScrapeInputSchema.safeParse(params);
    if (!parsed.success) {
      return {
        success: false,
        error: `Validation failed: ${parsed.error.issues.map(i => i.message).join(', ')}`,
        error_code: 'VALIDATION_ERROR',
      };
    }

    const input = parsed.data;
    const body: Record<string, unknown> = {
      url: input.url,
      formats: input.formats,
      onlyMainContent: input.only_main_content,
      timeout: input.timeout,
    };

    if (input.wait_for) body.waitFor = input.wait_for;
    if (input.include_tags) body.includeTags = input.include_tags;
    if (input.exclude_tags) body.excludeTags = input.exclude_tags;
    if (input.actions) body.actions = input.actions;

    try {
      const result = await this.firecrawlRequest('/scrape', 'POST', body);
      if (!result.ok) {
        return { success: false, error: this.formatError(result.status, result.data), error_code: 'SCRAPE_FAILED' };
      }
      return { success: true, data: result.data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), error_code: 'SCRAPE_FAILED' };
    }
  }

  /**
   * Crawl an entire site. Starts an async job — returns crawl_id.
   * Poll with crawlStatus() to get results.
   */
  private async crawl(params: Record<string, unknown>): Promise<SkillResult> {
    const parsed = CrawlInputSchema.safeParse(params);
    if (!parsed.success) {
      return {
        success: false,
        error: `Validation failed: ${parsed.error.issues.map(i => i.message).join(', ')}`,
        error_code: 'VALIDATION_ERROR',
      };
    }

    const input = parsed.data;
    const body: Record<string, unknown> = {
      url: input.url,
      limit: input.limit,
      scrapeOptions: {
        formats: input.formats,
        onlyMainContent: input.only_main_content,
      },
    };

    if (input.max_depth) body.maxDepth = input.max_depth;
    if (input.include_paths) body.includePaths = input.include_paths;
    if (input.exclude_paths) body.excludePaths = input.exclude_paths;

    try {
      const result = await this.firecrawlRequest('/crawl', 'POST', body);
      if (!result.ok) {
        return { success: false, error: this.formatError(result.status, result.data), error_code: 'CRAWL_FAILED' };
      }
      return { success: true, data: result.data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), error_code: 'CRAWL_FAILED' };
    }
  }

  /**
   * Check status of a crawl job and retrieve results.
   */
  private async crawlStatus(params: Record<string, unknown>): Promise<SkillResult> {
    const parsed = CrawlStatusInputSchema.safeParse(params);
    if (!parsed.success) {
      return {
        success: false,
        error: `Validation failed: ${parsed.error.issues.map(i => i.message).join(', ')}`,
        error_code: 'VALIDATION_ERROR',
      };
    }

    try {
      const result = await this.firecrawlRequest(`/crawl/${parsed.data.crawl_id}`, 'GET');
      if (!result.ok) {
        return { success: false, error: this.formatError(result.status, result.data), error_code: 'CRAWL_STATUS_FAILED' };
      }
      return { success: true, data: result.data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), error_code: 'CRAWL_STATUS_FAILED' };
    }
  }

  /**
   * Search the web and scrape results in one call.
   * Returns scraped content for each search result.
   */
  private async search(params: Record<string, unknown>): Promise<SkillResult> {
    const parsed = SearchInputSchema.safeParse(params);
    if (!parsed.success) {
      return {
        success: false,
        error: `Validation failed: ${parsed.error.issues.map(i => i.message).join(', ')}`,
        error_code: 'VALIDATION_ERROR',
      };
    }

    const input = parsed.data;
    const body: Record<string, unknown> = {
      query: input.query,
      limit: input.limit,
      scrapeOptions: {
        formats: input.formats,
        onlyMainContent: input.only_main_content,
      },
    };

    if (input.lang) body.lang = input.lang;
    if (input.country) body.country = input.country;

    try {
      const result = await this.firecrawlRequest('/search', 'POST', body);
      if (!result.ok) {
        return { success: false, error: this.formatError(result.status, result.data), error_code: 'SEARCH_FAILED' };
      }
      return { success: true, data: result.data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), error_code: 'SEARCH_FAILED' };
    }
  }

  /**
   * Extract structured data from URLs using LLM + schema.
   * Pass a natural language prompt and optional JSON schema.
   */
  private async extract(params: Record<string, unknown>): Promise<SkillResult> {
    const parsed = ExtractInputSchema.safeParse(params);
    if (!parsed.success) {
      return {
        success: false,
        error: `Validation failed: ${parsed.error.issues.map(i => i.message).join(', ')}`,
        error_code: 'VALIDATION_ERROR',
      };
    }

    const input = parsed.data;
    const body: Record<string, unknown> = {
      urls: input.urls,
      prompt: input.prompt,
    };

    if (input.schema) body.schema = input.schema;

    try {
      const result = await this.firecrawlRequest('/extract', 'POST', body);
      if (!result.ok) {
        return { success: false, error: this.formatError(result.status, result.data), error_code: 'EXTRACT_FAILED' };
      }
      return { success: true, data: result.data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), error_code: 'EXTRACT_FAILED' };
    }
  }

  /**
   * Map a site — discover all URLs on a domain without scraping content.
   * Fast way to understand site structure before targeted scraping.
   */
  private async map(params: Record<string, unknown>): Promise<SkillResult> {
    const parsed = MapInputSchema.safeParse(params);
    if (!parsed.success) {
      return {
        success: false,
        error: `Validation failed: ${parsed.error.issues.map(i => i.message).join(', ')}`,
        error_code: 'VALIDATION_ERROR',
      };
    }

    const input = parsed.data;
    const body: Record<string, unknown> = {
      url: input.url,
      limit: input.limit,
    };

    if (input.search) body.search = input.search;

    try {
      const result = await this.firecrawlRequest('/map', 'POST', body);
      if (!result.ok) {
        return { success: false, error: this.formatError(result.status, result.data), error_code: 'MAP_FAILED' };
      }
      return { success: true, data: result.data };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), error_code: 'MAP_FAILED' };
    }
  }
}
