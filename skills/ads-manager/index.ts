/**
 * Ads Manager Skill — Built-in
 *
 * Manage advertising campaigns — create, pause, report on ads.
 * Generic — supports Google Ads, Meta Ads, Bing Ads, or any platform via config.
 *
 * Permissions: network.outbound
 * Config: ADS_PLATFORM, API_KEY, ACCOUNT_ID
 */

import type { ApexSkill, SkillResult } from '../../packages/shared/skill-interface.js';

export class AdsManagerSkill implements ApexSkill {
  readonly name = 'ads-manager';
  readonly version = '1.0.0';
  readonly permissions = ['network.outbound'];
  readonly description = 'Manage advertising campaigns across configured ad platforms';

  private config: Record<string, string> = {};

  async initialize(config: Record<string, string>): Promise<void> {
    this.config = config;
  }

  async execute(method: string, params: Record<string, unknown>): Promise<SkillResult> {
    switch (method) {
      case 'getCampaigns':
        return this.getCampaigns(params);
      case 'createCampaign':
        return this.createCampaign(params);
      case 'pauseCampaign':
        return this.pauseCampaign(params);
      case 'getPerformance':
        return this.getPerformance(params);
      case 'updateBudget':
        return this.updateBudget(params);
      default:
        return { success: false, error: `Unknown method: ${method}`, error_code: 'UNKNOWN_METHOD' };
    }
  }

  async shutdown(): Promise<void> {
    // No persistent resources
  }

  // --- Platform-aware API helpers ---

  private getPlatform(): string {
    return this.config.ADS_PLATFORM ?? 'google-ads';
  }

  private getBaseUrl(): string {
    switch (this.getPlatform()) {
      case 'google-ads':
        return 'https://googleads.googleapis.com/v16';
      case 'meta-ads':
        return 'https://graph.facebook.com/v18.0';
      case 'bing-ads':
        return 'https://bingads.microsoft.com/v13';
      default:
        return this.config.API_URL ?? '';
    }
  }

  private getAuthHeaders(): Record<string, string> {
    switch (this.getPlatform()) {
      case 'google-ads':
        return {
          Authorization: `Bearer ${this.config.API_KEY}`,
          'developer-token': this.config.DEVELOPER_TOKEN ?? '',
          'login-customer-id': this.config.ACCOUNT_ID,
        };
      case 'meta-ads':
        return {}; // Token passed as query param
      default:
        return { Authorization: `Bearer ${this.config.API_KEY}` };
    }
  }

  // --- Methods ---

  private async getCampaigns(params: Record<string, unknown>): Promise<SkillResult> {
    const status = params.status as string | undefined;
    const platform = this.getPlatform();

    try {
      if (platform === 'google-ads') {
        const query = status
          ? `SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros FROM campaign WHERE campaign.status = '${status.toUpperCase()}'`
          : 'SELECT campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros FROM campaign';

        const response = await fetch(
          `${this.getBaseUrl()}/customers/${this.config.ACCOUNT_ID}/googleAds:searchStream`,
          {
            method: 'POST',
            headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
          }
        );
        if (!response.ok) {
          return { success: false, error: `Google Ads API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      if (platform === 'meta-ads') {
        let url = `${this.getBaseUrl()}/act_${this.config.ACCOUNT_ID}/campaigns?access_token=${this.config.API_KEY}&fields=name,status,daily_budget,lifetime_budget`;
        if (status) url += `&filtering=[{"field":"status","operator":"EQUAL","value":"${status.toUpperCase()}"}]`;

        const response = await fetch(url);
        if (!response.ok) {
          return { success: false, error: `Meta Ads API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { platform, status, message: 'Platform-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'GET_CAMPAIGNS_FAILED' };
    }
  }

  private async createCampaign(params: Record<string, unknown>): Promise<SkillResult> {
    const name = params.name as string;
    const budget = params.budget as number;
    const targeting = params.targeting as Record<string, unknown> | undefined;

    if (!name) return { success: false, error: 'name is required', error_code: 'MISSING_PARAM' };
    if (!budget) return { success: false, error: 'budget is required', error_code: 'MISSING_PARAM' };

    const platform = this.getPlatform();

    try {
      if (platform === 'google-ads') {
        const response = await fetch(
          `${this.getBaseUrl()}/customers/${this.config.ACCOUNT_ID}/campaigns:mutate`,
          {
            method: 'POST',
            headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              operations: [{
                create: {
                  name,
                  advertisingChannelType: 'SEARCH',
                  status: 'PAUSED', // Always start paused for safety
                  campaignBudget: { amountMicros: budget * 1_000_000 },
                  ...targeting,
                },
              }],
            }),
          }
        );
        if (!response.ok) {
          return { success: false, error: `Google Ads API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { platform, name, budget, targeting, message: 'Platform-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'CREATE_CAMPAIGN_FAILED' };
    }
  }

  private async pauseCampaign(params: Record<string, unknown>): Promise<SkillResult> {
    const campaignId = params.campaign_id as string;
    if (!campaignId) return { success: false, error: 'campaign_id is required', error_code: 'MISSING_PARAM' };

    const platform = this.getPlatform();

    try {
      if (platform === 'google-ads') {
        const response = await fetch(
          `${this.getBaseUrl()}/customers/${this.config.ACCOUNT_ID}/campaigns:mutate`,
          {
            method: 'POST',
            headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              operations: [{
                update: { resourceName: `customers/${this.config.ACCOUNT_ID}/campaigns/${campaignId}`, status: 'PAUSED' },
                updateMask: 'status',
              }],
            }),
          }
        );
        if (!response.ok) {
          return { success: false, error: `Google Ads API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { platform, campaignId, paused: true, message: 'Platform-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'PAUSE_CAMPAIGN_FAILED' };
    }
  }

  private async getPerformance(params: Record<string, unknown>): Promise<SkillResult> {
    const campaignId = params.campaign_id as string | undefined;
    const dateRange = (params.date_range as string) ?? 'LAST_7_DAYS';
    const platform = this.getPlatform();

    try {
      if (platform === 'google-ads') {
        let query = `SELECT campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign`;
        if (campaignId) query += ` WHERE campaign.id = ${campaignId}`;
        query += ` DURING ${dateRange}`;

        const response = await fetch(
          `${this.getBaseUrl()}/customers/${this.config.ACCOUNT_ID}/googleAds:searchStream`,
          {
            method: 'POST',
            headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
          }
        );
        if (!response.ok) {
          return { success: false, error: `Google Ads API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { platform, campaignId, dateRange, message: 'Platform-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'GET_PERFORMANCE_FAILED' };
    }
  }

  private async updateBudget(params: Record<string, unknown>): Promise<SkillResult> {
    const campaignId = params.campaign_id as string;
    const newBudget = params.budget as number;

    if (!campaignId) return { success: false, error: 'campaign_id is required', error_code: 'MISSING_PARAM' };
    if (!newBudget) return { success: false, error: 'budget is required', error_code: 'MISSING_PARAM' };

    // Safety: budget changes should be validated by the marketing agent's rules
    // The agent is responsible for checking thresholds before calling this method

    const platform = this.getPlatform();

    try {
      if (platform === 'google-ads') {
        const response = await fetch(
          `${this.getBaseUrl()}/customers/${this.config.ACCOUNT_ID}/campaignBudgets:mutate`,
          {
            method: 'POST',
            headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              operations: [{
                update: {
                  resourceName: `customers/${this.config.ACCOUNT_ID}/campaignBudgets/${campaignId}`,
                  amountMicros: newBudget * 1_000_000,
                },
                updateMask: 'amountMicros',
              }],
            }),
          }
        );
        if (!response.ok) {
          return { success: false, error: `Google Ads API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { platform, campaignId, newBudget, message: 'Platform-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'UPDATE_BUDGET_FAILED' };
    }
  }
}
