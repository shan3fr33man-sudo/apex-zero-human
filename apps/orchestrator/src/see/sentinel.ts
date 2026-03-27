/**
 * Sentinel — AI Frontier Monitor
 *
 * Scans tiered sources for AI model releases, prompting breakthroughs,
 * new skills, and domain-specific changes relevant to APEX.
 *
 * Uses claude-haiku-4-5 for cost efficiency — Sentinel runs frequently
 * and most scans yield no actionable discoveries.
 *
 * Source Tiers:
 *   TIER_1 (6h)  — Anthropic direct (models, changelog)
 *   TIER_2 (12h) — Frontier models (OpenRouter)
 *   TIER_3 (24h) — Research papers (arxiv)
 *   TIER_5 (48h) — Domain specific (RingCentral, etc.)
 *
 * Relevance scoring (0-100):
 *   90-100 — New Anthropic model (always critical)
 *   60-80  — Better prompting technique (high if proven)
 *   40-60  — New skill pattern (medium, needs Crucible)
 *   20-40  — Competitor feature (low, monitor only)
 *   0-10   — Irrelevant hype (discard)
 */
import { createLogger } from '../lib/logger.js';
import { Chronicle } from './chronicle.js';
import type { Discovery, SourceTier } from './types.js';
import { SENTINEL_SOURCES } from './types.js';

const log = createLogger('Sentinel');

/** Track last scan time per tier to respect intervals */
const lastScanTimes: Map<string, number> = new Map();

export class Sentinel {
  private chronicle: Chronicle;

  constructor(chronicle: Chronicle) {
    this.chronicle = chronicle;
  }

  /**
   * Scan all source tiers that are due for a check.
   * Returns actionable discoveries sorted by relevance.
   */
  async scan(): Promise<Discovery[]> {
    const discoveries: Discovery[] = [];

    for (const tier of SENTINEL_SOURCES) {
      if (!this.isDue(tier)) continue;

      try {
        const tierDiscoveries = await this.scanTier(tier);
        discoveries.push(...tierDiscoveries);
        lastScanTimes.set(tier.tier, Date.now());
      } catch (err) {
        await this.chronicle.logError(`SENTINEL_SCAN_${tier.tier}`, err);
      }
    }

    // Sort by relevance, highest first
    discoveries.sort((a, b) => b.relevance_score - a.relevance_score);

    log.info('Sentinel scan complete', {
      totalDiscoveries: discoveries.length,
      actionable: discoveries.filter(d => d.relevance_score >= 40).length,
    });

    return discoveries;
  }

  /**
   * Check if a source tier is due for scanning based on its interval.
   */
  private isDue(tier: SourceTier): boolean {
    const lastScan = lastScanTimes.get(tier.tier);
    if (!lastScan) return true;

    const elapsed = Date.now() - lastScan;
    const intervalMs = tier.interval_hours * 60 * 60 * 1000;
    return elapsed >= intervalMs;
  }

  /**
   * Scan a single source tier. Fetches each URL and analyzes
   * the content for APEX-relevant discoveries.
   */
  private async scanTier(tier: SourceTier): Promise<Discovery[]> {
    const discoveries: Discovery[] = [];

    for (const url of tier.urls) {
      try {
        const content = await this.fetchSource(url);
        if (!content) continue;

        const parsed = await this.analyzeContent(content, url, tier.tier);
        if (parsed) {
          discoveries.push(...parsed);
        }
      } catch (err) {
        await this.chronicle.logError(`SENTINEL_FETCH_${url}`, err);
      }
    }

    return discoveries;
  }

  /**
   * Fetch content from a source URL. Returns raw text.
   * Timeouts after 30 seconds. Returns null on failure.
   */
  private async fetchSource(url: string): Promise<string | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'APEX-SEE-Sentinel/1.0' },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        log.debug('Sentinel fetch failed', { url, status: response.status });
        return null;
      }

      // Cap response size at 100KB to avoid memory issues
      const text = await response.text();
      return text.substring(0, 100_000);
    } catch {
      return null;
    }
  }

  /**
   * Analyze fetched content for APEX-relevant discoveries.
   * Uses claude-haiku-4-5 via Anthropic API for cost efficiency.
   *
   * Returns parsed discoveries with relevance scores, or empty array
   * if the content contains nothing actionable.
   */
  private async analyzeContent(
    content: string,
    sourceUrl: string,
    sourceTier: string
  ): Promise<Discovery[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return [];

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2048,
          system: `You are the Sentinel agent for APEX, an AI-powered autonomous company builder.
Analyze the following content for discoveries relevant to APEX's capabilities:
- New AI models (especially Anthropic) — score 90-100
- Prompting techniques for multi-agent systems — score 60-80
- New tool/skill patterns for autonomous agents — score 40-60
- Competitor features or industry changes — score 20-40
- Irrelevant content — score 0-10

Respond with a JSON array of discoveries. Each discovery:
{"title": "...", "relevance_score": 0-100, "impact_category": "model|prompting|skill|competitor|domain", "urgency": "CRITICAL|HIGH|MEDIUM|LOW", "raw_summary": "..."}

If nothing actionable, respond with: []`,
          messages: [{
            role: 'user',
            content: `Source: ${sourceUrl}\nTier: ${sourceTier}\n\nContent:\n${content.substring(0, 10_000)}`,
          }],
        }),
      });

      if (!response.ok) return [];

      const data = await response.json() as {
        content?: Array<{ type: string; text?: string }>;
      };

      const text = data.content?.[0]?.text ?? '[]';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        title: string;
        relevance_score: number;
        impact_category: string;
        urgency: string;
        raw_summary: string;
      }>;

      return parsed.map(item => ({
        title: item.title,
        source_url: sourceUrl,
        source_tier: sourceTier,
        relevance_score: Math.min(100, Math.max(0, item.relevance_score)),
        impact_category: item.impact_category,
        urgency: (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(item.urgency)
          ? item.urgency
          : 'LOW') as Discovery['urgency'],
        raw_summary: item.raw_summary,
        status: 'new' as const,
      }));
    } catch {
      return [];
    }
  }
}
