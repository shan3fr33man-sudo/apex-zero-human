/**
 * Web Browser Skill — Built-in (Firecrawl-Powered)
 *
 * Full web scraping, crawling, and structured data extraction via Firecrawl.
 * Every APEX agent can use this skill to browse the web, extract content,
 * take screenshots, crawl sites, and do structured extraction.
 *
 * Firecrawl handles: JS rendering, anti-bot bypass, proxy rotation,
 * clean markdown output, structured LLM extraction, and site crawling.
 *
 * Permissions: browser.navigate, browser.screenshot, network.outbound
 * Config: FIRECRAWL_API_KEY (injected at runtime from company/platform config)
 */

import type { ApexSkill, SkillResult } from '../../packages/shared/skill-interface.js';

export class WebBrowserSkill implements ApexSkill {
  readonly name = 'web-browser';
  readonly version = '2.0.0';
  readonly permissions = ['browser.navigate', 'browser.screenshot', 'network.outbound'];
  readonly description = 'Web scraping, crawling, screenshots, and structured extraction via Firecrawl';

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
        error: 'FIRECRAWL_API_KEY not configured',
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
      case 'map':
        return this.mapSite(params);
      case 'extract':
        return this.extract(params);
      case 'screenshot':
        return this.screenshot(params);
      case 'search':
        return this.search(params);
      // Legacy method names (backwards compatible)
      case 'navigate':
        return this.scrape({ ...params, formats: ['markdown'] });
      case 'extractText':
        return this.scrape({ ...params, formats: ['markdown'] });
      case 'fillForm':
        return this.scrape({ ...params, formats: ['html'], actions: params.actions });
      default:
        return { success: false, error: `Unknown method: ${method}`, error_code: 'UNKNOWN_METHOD' };
    }
  }

  async shutdown(): Promise<void> {
    // No persistent resources
  }

  // --- Firecrawl API Methods ---

  /**
   * Scrape a single URL — returns clean markdown, HTML, links, and metadata.
   * This is the workhorse method agents use for reading any web page.
   *
   * @param params.url - URL to scrape
   * @param params.formats - Array of output formats: 'markdown', 'html', 'rawHtml', 'links', 'screenshot', 'screenshot@fullPage'
   * @param params.only_main_content - Strip nav/footer/sidebar (default: true)
   * @param params.wait_for - CSS selector to wait for before scraping
   * @param params.timeout - Timeout in ms (default: 30000)
   * @param params.actions - Array of browser actions to perform before scraping (click, scroll, fill, etc.)
   */
  private async scrape(params: Record<string, unknown>): Promise<SkillResult> {
    const url = params.url as string;
    if (!url) return { success: false, error: 'url is required', error_code: 'MISSING_PARAM' };

    const body: Record<string, unknown> = {
      url,
      formats: (params.formats as string[]) ?? ['markdown'],
      onlyMainContent: params.only_main_content ?? true,
    };

    if (params.wait_for) body.waitFor = params.wait_for;
    if (params.timeout) body.timeout = params.timeout;
    if (params.include_tags) body.includeTags = params.include_tags;
    if (params.exclude_tags) body.excludeTags = params.exclude_tags;
    if (params.actions) body.actions = params.actions;

    try {
      const response = await fetch(`${this.baseUrl}/scrape`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: `Firecrawl scrape error: ${response.status} — ${(errorData as Record<string, unknown>).error ?? 'Unknown error'}`,
          error_code: 'SCRAPE_FAILED',
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'SCRAPE_FAILED' };
    }
  }

  /**
   * Crawl an entire site — starts async crawl job, returns crawl ID.
   * Use crawlStatus() to poll for results.
   *
   * @param params.url - Starting URL
   * @param params.limit - Max pages to crawl (default: 50)
   * @param params.max_depth - Max link depth from start URL
   * @param params.include_patterns - Array of URL patterns to include
   * @param params.exclude_patterns - Array of URL patterns to exclude
   */
  private async crawl(params: Record<string, unknown>): Promise<SkillResult> {
    const url = params.url as string;
    if (!url) return { success: false, error: 'url is required', error_code: 'MISSING_PARAM' };

    const body: Record<string, unknown> = {
      url,
      limit: (params.limit as number) ?? 50,
      scrapeOptions: {
        formats: (params.formats as string[]) ?? ['markdown'],
        onlyMainContent: params.only_main_content ?? true,
      },
    };

    if (params.max_depth) body.maxDepth = params.max_depth;
    if (params.include_patterns) body.includePaths = params.include_patterns;
    if (params.exclude_patterns) body.excludePaths = params.exclude_patterns;

    try {
      const response = await fetch(`${this.baseUrl}/crawl`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: `Firecrawl crawl error: ${response.status} — ${(errorData as Record<string, unknown>).error ?? 'Unknown error'}`,
          error_code: 'CRAWL_FAILED',
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'CRAWL_FAILED' };
    }
  }

  /**
   * Check crawl job status and get results.
   *
   * @param params.crawl_id - The crawl job ID returned by crawl()
   */
  private async crawlStatus(params: Record<string, unknown>): Promise<SkillResult> {
    const crawlId = params.crawl_id as string;
    if (!crawlId) return { success: false, error: 'crawl_id is required', error_code: 'MISSING_PARAM' };

    try {
      const response = await fetch(`${this.baseUrl}/crawl/${crawlId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Firecrawl crawl status error: ${response.status}`,
          error_code: 'CRAWL_STATUS_FAILED',
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'CRAWL_STATUS_FAILED' };
    }
  }

  /**
   * Map a site — get all URLs on a domain without scraping content.
   * Fast way to discover site structure.
   *
   * @param params.url - Base URL to map
   * @param params.limit - Max URLs to return
   * @param params.search - Optional search query to filter URLs
   */
  private async mapSite(params: Record<string, unknown>): Promise<SkillResult> {
    const url = params.url as string;
    if (!url) return { success: false, error: 'url is required', error_code: 'MISSING_PARAM' };

    const body: Record<string, unknown> = { url };
    if (params.limit) body.limit = params.limit;
    if (params.search) body.search = params.search;

    try {
      const response = await fetch(`${this.baseUrl}/map`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: `Firecrawl map error: ${response.status} — ${(errorData as Record<string, unknown>).error ?? 'Unknown error'}`,
          error_code: 'MAP_FAILED',
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'MAP_FAILED' };
    }
  }

  /**
   * Extract structured data from a URL using LLM extraction.
   * Pass a schema or prompt describing what to extract.
   *
   * @param params.urls - Array of URLs to extract from
   * @param params.prompt - Natural language description of what to extract
   * @param params.schema - JSON schema for structured output
   */
  private async extract(params: Record<string, unknown>): Promise<SkillResult> {
    const urls = params.urls as string[];
    if (!urls || urls.length === 0) return { success: false, error: 'urls array is required', error_code: 'MISSING_PARAM' };

    const body: Record<string, unknown> = { urls };
    if (params.prompt) body.prompt = params.prompt;
    if (params.schema) body.schema = params.schema;

    try {
      const response = await fetch(`${this.baseUrl}/extract`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: `Firecrawl extract error: ${response.status} — ${(errorData as Record<string, unknown>).error ?? 'Unknown error'}`,
          error_code: 'EXTRACT_FAILED',
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'EXTRACT_FAILED' };
    }
  }

  /**
   * Take a screenshot of a URL (via Firecrawl's scrape with screenshot format).
   *
   * @param params.url - URL to screenshot
   * @param params.fullPage - Full page screenshot (default: true)
   */
  private async screenshot(params: Record<string, unknown>): Promise<SkillResult> {
    const url = params.url as string;
    if (!url) return { success: false, error: 'url is required', error_code: 'MISSING_PARAM' };

    const fullPage = (params.fullPage as boolean) ?? true;
    const format = fullPage ? 'screenshot@fullPage' : 'screenshot';

    return this.scrape({
      url,
      formats: [format],
      only_main_content: false,
    });
  }

  /**
   * Search the web and return scraped results for each hit.
   * Combines Google search with Firecrawl scraping.
   *
   * @param params.query - Search query
   * @param params.limit - Max results (default: 5)
   * @param params.lang - Language code
   * @param params.country - Country code
   */
  private async search(params: Record<string, unknown>): Promise<SkillResult> {
    const query = params.query as string;
    if (!query) return { success: false, error: 'query is required', error_code: 'MISSING_PARAM' };

    const body: Record<string, unknown> = {
      query,
      limit: (params.limit as number) ?? 5,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
      },
    };

    if (params.lang) body.lang = params.lang;
    if (params.country) body.country = params.country;

    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: `Firecrawl search error: ${response.status} — ${(errorData as Record<string, unknown>).error ?? 'Unknown error'}`,
          error_code: 'SEARCH_FAILED',
        };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'SEARCH_FAILED' };
    }
  }
}
