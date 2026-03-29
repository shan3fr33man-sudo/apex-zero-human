/**
 * Skills Engine — Registry
 *
 * Manages skill installation, versioning, security scanning, and metadata.
 * Skills can be built-in (shipped with APEX) or external (installed by operators).
 *
 * External skills are scanned for dangerous patterns before installation.
 * All skills are versioned and can be rolled back.
 */

import type {
  SkillRegistryEntry,
  SkillInstallResult,
  SkillScanResult,
  SkillConfigField,
} from './types.js';
import { SkillSandbox } from './sandbox.js';

// Built-in skill names — these ship with APEX and are always available
const BUILTIN_SKILLS = [
  'web-browser',
  'email-reader',
  'phone-listener',
  'crm-connector',
  'calendar-manager',
  'ads-manager',
  'review-requester',
  'document-generator',
  'firecrawl',
] as const;

export type BuiltinSkillName = (typeof BUILTIN_SKILLS)[number];

export class SkillRegistry {
  private sandbox: SkillSandbox;
  private supabaseUrl: string;
  private serviceToken: string;

  constructor(supabaseUrl: string, serviceToken: string) {
    this.sandbox = new SkillSandbox();
    this.supabaseUrl = supabaseUrl;
    this.serviceToken = serviceToken;
  }

  /**
   * Register all built-in skills for a company.
   * Called during company onboarding.
   */
  async registerBuiltins(companyId: string): Promise<void> {
    for (const skillName of BUILTIN_SKILLS) {
      const existing = await this.getSkill(companyId, skillName);
      if (existing) continue;

      await this.insertSkill({
        company_id: companyId,
        name: skillName,
        version: '1.0.0',
        description: this.getBuiltinDescription(skillName),
        source_url: null,
        commit_sha: null,
        permissions: this.getBuiltinPermissions(skillName),
        safety_score: 100,
        verified: true,
        is_builtin: true,
        enabled: true,
        config_schema: this.getBuiltinConfigSchema(skillName),
      });
    }
  }

  /**
   * Install an external skill from a URL.
   * Fetches code, scans for security issues, and registers if safe.
   */
  async installExternal(
    companyId: string,
    sourceUrl: string,
    skillCode: string
  ): Promise<SkillInstallResult> {
    // Step 1: Security scan
    const scanResult = this.sandbox.scanCode(skillCode);

    if (scanResult.blocked) {
      return {
        success: false,
        error: `Skill failed security scan: ${scanResult.violations.join(', ')}`,
        scan_result: scanResult,
      };
    }

    // Step 2: Extract metadata from skill code
    const metadata = this.extractMetadata(skillCode);
    if (!metadata) {
      return {
        success: false,
        error: 'Could not extract skill metadata. Ensure the skill exports name, version, and permissions.',
      };
    }

    // Step 3: Check for duplicate
    const existing = await this.getSkill(companyId, metadata.name);
    if (existing) {
      return {
        success: false,
        error: `Skill '${metadata.name}' is already installed. Use updateSkill() to upgrade.`,
      };
    }

    // Step 4: Pin to commit SHA if GitHub URL
    const commitSha = await this.resolveCommitSha(sourceUrl);

    // Step 5: Register in database
    await this.insertSkill({
      company_id: companyId,
      name: metadata.name,
      version: metadata.version,
      description: metadata.description,
      source_url: sourceUrl,
      commit_sha: commitSha,
      permissions: metadata.permissions,
      safety_score: scanResult.score,
      verified: scanResult.score >= 80,
      is_builtin: false,
      enabled: true,
      config_schema: {},
    });

    return { success: true, skill_name: metadata.name, scan_result: scanResult };
  }

  /**
   * Get a single skill by company and name.
   */
  async getSkill(companyId: string, skillName: string): Promise<SkillRegistryEntry | null> {
    const response = await fetch(
      `${this.supabaseUrl}/rest/v1/skills?company_id=eq.${companyId}&name=eq.${skillName}&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${this.serviceToken}`,
          apikey: this.serviceToken,
        },
      }
    );

    const data = (await response.json()) as SkillRegistryEntry[];
    return data.length > 0 ? data[0] : null;
  }

  /**
   * List all skills for a company (built-in + external).
   */
  async listSkills(companyId: string): Promise<SkillRegistryEntry[]> {
    const response = await fetch(
      `${this.supabaseUrl}/rest/v1/skills?company_id=eq.${companyId}&order=is_builtin.desc,name.asc`,
      {
        headers: {
          Authorization: `Bearer ${this.serviceToken}`,
          apikey: this.serviceToken,
        },
      }
    );

    return (await response.json()) as SkillRegistryEntry[];
  }

  /**
   * Enable or disable a skill for a company.
   */
  async setEnabled(companyId: string, skillName: string, enabled: boolean): Promise<void> {
    await fetch(
      `${this.supabaseUrl}/rest/v1/skills?company_id=eq.${companyId}&name=eq.${skillName}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${this.serviceToken}`,
          apikey: this.serviceToken,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ enabled }),
      }
    );
  }

  /**
   * Uninstall an external skill. Built-in skills cannot be uninstalled (only disabled).
   */
  async uninstall(companyId: string, skillName: string): Promise<boolean> {
    const skill = await this.getSkill(companyId, skillName);
    if (!skill) return false;

    if (skill.is_builtin) {
      // Built-in skills can only be disabled, not removed
      await this.setEnabled(companyId, skillName, false);
      return true;
    }

    await fetch(
      `${this.supabaseUrl}/rest/v1/skills?company_id=eq.${companyId}&name=eq.${skillName}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.serviceToken}`,
          apikey: this.serviceToken,
        },
      }
    );
    return true;
  }

  /**
   * Get list of built-in skill names.
   */
  getBuiltinSkillNames(): readonly string[] {
    return BUILTIN_SKILLS;
  }

  // --- Private helpers ---

  private async insertSkill(
    skill: Omit<SkillRegistryEntry, 'id' | 'created_at' | 'updated_at'>
  ): Promise<void> {
    await fetch(`${this.supabaseUrl}/rest/v1/skills`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceToken}`,
        apikey: this.serviceToken,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(skill),
    });
  }

  private extractMetadata(
    code: string
  ): { name: string; version: string; description: string; permissions: string[] } | null {
    try {
      // Look for exported name, version, permissions in the skill code
      const nameMatch = code.match(/name:\s*['"]([^'"]+)['"]/);
      const versionMatch = code.match(/version:\s*['"]([^'"]+)['"]/);
      const descMatch = code.match(/description:\s*['"]([^'"]+)['"]/);
      const permMatch = code.match(/permissions:\s*\[([^\]]*)\]/);

      if (!nameMatch || !versionMatch) return null;

      const permissions = permMatch
        ? permMatch[1]
            .split(',')
            .map((p) => p.trim().replace(/['"]/g, ''))
            .filter(Boolean)
        : [];

      return {
        name: nameMatch[1],
        version: versionMatch[1],
        description: descMatch ? descMatch[1] : 'No description provided',
        permissions,
      };
    } catch {
      return null;
    }
  }

  private async resolveCommitSha(sourceUrl: string): Promise<string | null> {
    if (!sourceUrl.includes('github.com')) return null;

    try {
      // Convert GitHub URL to API URL for commit info
      const match = sourceUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) return null;

      const [, owner, repo] = match;
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`,
        { headers: { Accept: 'application/vnd.github.v3+json' } }
      );

      if (!response.ok) return null;
      const commits = (await response.json()) as Array<{ sha: string }>;
      return commits[0]?.sha ?? null;
    } catch {
      return null;
    }
  }

  private getBuiltinDescription(name: string): string {
    const descriptions: Record<string, string> = {
      'web-browser': 'Headless browser for screenshots, content extraction, form filling, and visual QA',
      'email-reader': 'Read, search, and send emails via configured email provider',
      'phone-listener': 'Process inbound call events, send SMS, manage voicemail via configured VoIP provider',
      'crm-connector': 'Read/write to the company CRM — contacts, jobs, quotes, bookings',
      'calendar-manager': 'Manage calendars — create, read, update events and check availability',
      'ads-manager': 'Manage advertising campaigns — create, pause, report on ads across configured platforms',
      'review-requester': 'Send post-service review requests via configured review platforms',
      'document-generator': 'Generate PDF/DOCX documents from templates — quotes, invoices, reports, contracts',
      'firecrawl': 'Web scraping, crawling, search, structured extraction, and site mapping via Firecrawl',
    };
    return descriptions[name] ?? 'APEX built-in skill';
  }

  private getBuiltinPermissions(name: string): string[] {
    const permissions: Record<string, string[]> = {
      'web-browser': ['browser.navigate', 'browser.screenshot'],
      'email-reader': ['network.gmail', 'network.resend'],
      'phone-listener': ['network.twilio', 'network.outbound'],
      'crm-connector': ['network.outbound', 'db.read'],
      'calendar-manager': ['network.outbound'],
      'ads-manager': ['network.outbound'],
      'review-requester': ['network.outbound', 'network.resend'],
      'document-generator': ['files.read', 'files.write'],
      'firecrawl': ['network.firecrawl'],
    };
    return permissions[name] ?? [];
  }

  private getBuiltinConfigSchema(name: string): Record<string, SkillConfigField> {
    const schemas: Record<string, Record<string, SkillConfigField>> = {
      'web-browser': {},
      'email-reader': {
        EMAIL_PROVIDER: { type: 'string', required: true, description: 'Email provider (gmail, resend, smtp)' },
        API_KEY: { type: 'string', required: true, description: 'API key or OAuth token for the email provider' },
        FROM_ADDRESS: { type: 'string', required: true, description: 'Default from email address' },
      },
      'phone-listener': {
        VOIP_PROVIDER: { type: 'string', required: true, description: 'VoIP provider (twilio, ringcentral, vonage)' },
        ACCOUNT_SID: { type: 'string', required: true, description: 'VoIP provider account SID' },
        AUTH_TOKEN: { type: 'string', required: true, description: 'VoIP provider auth token' },
        FROM_NUMBER: { type: 'string', required: true, description: 'Default outbound phone number' },
      },
      'crm-connector': {
        CRM_PROVIDER: { type: 'string', required: true, description: 'CRM provider (smartmoving, hubspot, salesforce, custom)' },
        API_URL: { type: 'url', required: true, description: 'CRM API base URL' },
        API_KEY: { type: 'string', required: true, description: 'CRM API key or token' },
      },
      'calendar-manager': {
        CALENDAR_PROVIDER: { type: 'string', required: true, description: 'Calendar provider (google, outlook, caldav)' },
        API_KEY: { type: 'string', required: true, description: 'Calendar API key or OAuth token' },
        CALENDAR_ID: { type: 'string', required: false, description: 'Default calendar ID', default: 'primary' },
      },
      'ads-manager': {
        ADS_PLATFORM: { type: 'string', required: true, description: 'Ad platform (google-ads, meta-ads, bing-ads)' },
        API_KEY: { type: 'string', required: true, description: 'Ad platform API key or token' },
        ACCOUNT_ID: { type: 'string', required: true, description: 'Ad platform account/customer ID' },
      },
      'review-requester': {
        REVIEW_PLATFORM_PRIMARY: { type: 'string', required: true, description: 'Primary review platform (google, yelp, trustpilot)' },
        REVIEW_URL_PRIMARY: { type: 'url', required: true, description: 'Primary review URL for the business' },
        REVIEW_PLATFORM_SECONDARY: { type: 'string', required: false, description: 'Secondary review platform' },
        REVIEW_URL_SECONDARY: { type: 'url', required: false, description: 'Secondary review URL' },
        DELAY_HOURS: { type: 'number', required: false, description: 'Hours to wait after service before sending request', default: 24 },
      },
      'document-generator': {
        TEMPLATE_DIR: { type: 'string', required: false, description: 'Path to document templates', default: '/tmp/apex-skill-scratch/templates' },
        COMPANY_LOGO_URL: { type: 'url', required: false, description: 'Company logo URL for document headers' },
      },
      'firecrawl': {
        FIRECRAWL_API_KEY: { type: 'string', required: true, description: 'Firecrawl API key (starts with fc-)' },
        FIRECRAWL_BASE_URL: { type: 'url', required: false, description: 'Firecrawl API base URL', default: 'https://api.firecrawl.dev/v1' },
      },
    };
    return schemas[name] ?? {};
  }
}
