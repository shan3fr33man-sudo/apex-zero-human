/**
 * CRM Connector Skill — Built-in
 *
 * Read/write to the company's CRM — contacts, jobs, quotes, bookings.
 * Generic — supports SmartMoving, HubSpot, Salesforce, or any CRM via config.
 *
 * Permissions: network.outbound, db.read
 * Config: CRM_PROVIDER, API_URL, API_KEY
 */

import type { ApexSkill, SkillResult } from '../../packages/shared/skill-interface.js';

export class CrmConnectorSkill implements ApexSkill {
  readonly name = 'crm-connector';
  readonly version = '1.0.0';
  readonly permissions = ['network.outbound', 'db.read'];
  readonly description = 'Read/write to the company CRM — contacts, jobs, quotes, bookings';

  private config: Record<string, string> = {};

  async initialize(config: Record<string, string>): Promise<void> {
    this.config = config;
  }

  async execute(method: string, params: Record<string, unknown>): Promise<SkillResult> {
    switch (method) {
      case 'getContacts':
        return this.getContacts(params);
      case 'createContact':
        return this.createContact(params);
      case 'getJobs':
        return this.getJobs(params);
      case 'createJob':
        return this.createJob(params);
      case 'getBookings':
        return this.getBookings(params);
      case 'updateJob':
        return this.updateJob(params);
      case 'checkComplaints':
        return this.checkComplaints(params);
      default:
        return { success: false, error: `Unknown method: ${method}`, error_code: 'UNKNOWN_METHOD' };
    }
  }

  async shutdown(): Promise<void> {
    // No persistent resources
  }

  // --- Generic CRM API wrapper ---

  private async crmRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ ok: boolean; data: unknown; status: number }> {
    const baseUrl = this.config.API_URL;
    const apiKey = this.config.API_KEY;
    const provider = this.config.CRM_PROVIDER ?? 'generic';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(provider, apiKey),
    };

    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    });

    const data = await response.json();
    return { ok: response.ok, data, status: response.status };
  }

  private getAuthHeaders(provider: string, apiKey: string): Record<string, string> {
    switch (provider) {
      case 'hubspot':
        return { Authorization: `Bearer ${apiKey}` };
      case 'salesforce':
        return { Authorization: `Bearer ${apiKey}` };
      case 'smartmoving':
        return { 'X-Api-Key': apiKey };
      default:
        return { Authorization: `Bearer ${apiKey}` };
    }
  }

  private getEndpointMap(): Record<string, string> {
    const provider = this.config.CRM_PROVIDER ?? 'generic';

    const maps: Record<string, Record<string, string>> = {
      hubspot: {
        contacts: '/crm/v3/objects/contacts',
        deals: '/crm/v3/objects/deals',
        companies: '/crm/v3/objects/companies',
      },
      salesforce: {
        contacts: '/services/data/v57.0/sobjects/Contact',
        opportunities: '/services/data/v57.0/sobjects/Opportunity',
        accounts: '/services/data/v57.0/sobjects/Account',
      },
      smartmoving: {
        contacts: '/api/contacts',
        jobs: '/api/jobs',
        bookings: '/api/bookings',
        quotes: '/api/quotes',
      },
      generic: {
        contacts: '/api/contacts',
        jobs: '/api/jobs',
        bookings: '/api/bookings',
        quotes: '/api/quotes',
      },
    };

    return maps[provider] ?? maps.generic;
  }

  // --- Methods ---

  private async getContacts(params: Record<string, unknown>): Promise<SkillResult> {
    const limit = (params.limit as number) ?? 20;
    const search = params.search as string | undefined;
    const endpoints = this.getEndpointMap();

    try {
      let url = `${endpoints.contacts}?limit=${limit}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const result = await this.crmRequest(url);
      if (!result.ok) {
        return { success: false, error: `CRM API error: ${result.status}`, error_code: 'API_ERROR' };
      }
      return { success: true, data: result.data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'CRM_FETCH_FAILED' };
    }
  }

  private async createContact(params: Record<string, unknown>): Promise<SkillResult> {
    const endpoints = this.getEndpointMap();

    try {
      const result = await this.crmRequest(endpoints.contacts, {
        method: 'POST',
        body: JSON.stringify(params),
      });
      if (!result.ok) {
        return { success: false, error: `CRM API error: ${result.status}`, error_code: 'API_ERROR' };
      }
      return { success: true, data: result.data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'CRM_CREATE_FAILED' };
    }
  }

  private async getJobs(params: Record<string, unknown>): Promise<SkillResult> {
    const date = params.date as string | undefined;
    const status = params.status as string | undefined;
    const endpoints = this.getEndpointMap();

    try {
      let url = endpoints.jobs ?? '/api/jobs';
      const queryParts: string[] = [];
      if (date) queryParts.push(`date=${date}`);
      if (status) queryParts.push(`status=${status}`);
      if (queryParts.length > 0) url += `?${queryParts.join('&')}`;

      const result = await this.crmRequest(url);
      if (!result.ok) {
        return { success: false, error: `CRM API error: ${result.status}`, error_code: 'API_ERROR' };
      }
      return { success: true, data: result.data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'CRM_FETCH_FAILED' };
    }
  }

  private async createJob(params: Record<string, unknown>): Promise<SkillResult> {
    const endpoints = this.getEndpointMap();

    try {
      const result = await this.crmRequest(endpoints.jobs ?? '/api/jobs', {
        method: 'POST',
        body: JSON.stringify(params),
      });
      if (!result.ok) {
        return { success: false, error: `CRM API error: ${result.status}`, error_code: 'API_ERROR' };
      }
      return { success: true, data: result.data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'CRM_CREATE_FAILED' };
    }
  }

  private async getBookings(params: Record<string, unknown>): Promise<SkillResult> {
    const date = params.date as string | undefined;
    const endpoints = this.getEndpointMap();

    try {
      let url = endpoints.bookings ?? '/api/bookings';
      if (date) url += `?date=${date}`;

      const result = await this.crmRequest(url);
      if (!result.ok) {
        return { success: false, error: `CRM API error: ${result.status}`, error_code: 'API_ERROR' };
      }
      return { success: true, data: result.data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'CRM_FETCH_FAILED' };
    }
  }

  private async updateJob(params: Record<string, unknown>): Promise<SkillResult> {
    const jobId = params.job_id as string;
    if (!jobId) return { success: false, error: 'job_id is required', error_code: 'MISSING_PARAM' };

    const endpoints = this.getEndpointMap();

    try {
      const { job_id: _, ...updateData } = params;
      const result = await this.crmRequest(`${endpoints.jobs ?? '/api/jobs'}/${jobId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });
      if (!result.ok) {
        return { success: false, error: `CRM API error: ${result.status}`, error_code: 'API_ERROR' };
      }
      return { success: true, data: result.data };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'CRM_UPDATE_FAILED' };
    }
  }

  private async checkComplaints(params: Record<string, unknown>): Promise<SkillResult> {
    const customerId = params.customer_id as string;
    if (!customerId) return { success: false, error: 'customer_id is required', error_code: 'MISSING_PARAM' };

    try {
      const result = await this.crmRequest(
        `/api/complaints?customer_id=${customerId}`
      );
      if (!result.ok) {
        return { success: false, error: `CRM API error: ${result.status}`, error_code: 'API_ERROR' };
      }

      const complaints = result.data as { items?: unknown[]; total?: number } | null;
      return {
        success: true,
        data: {
          has_complaints: (complaints?.total ?? 0) > 0,
          complaint_count: complaints?.total ?? 0,
          complaints: complaints?.items ?? [],
        },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'COMPLAINT_CHECK_FAILED' };
    }
  }
}
