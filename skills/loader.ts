/**
 * Skills Engine — Loader
 *
 * Loads and instantiates skills at runtime. Handles both built-in skills
 * (imported directly) and external skills (loaded from registry).
 *
 * The loader is the bridge between the orchestrator's agent execution
 * and the skill sandbox. When an agent calls a skill, the flow is:
 *
 * Agent → Loader.executeSkill() → Sandbox.execute() → Skill.execute()
 */

import type { ApexSkill, SkillResult } from '../packages/shared/skill-interface.js';
import type { SkillExecutionContext, SkillExecutionResult, SkillRegistryEntry } from './types.js';
import { SANDBOX_DEFAULTS } from './types.js';
import { SkillSandbox } from './sandbox.js';
import { SkillRegistry } from './registry.js';

// Built-in skill imports
import { WebBrowserSkill } from './web-browser/index.js';
import { EmailReaderSkill } from './email-reader/index.js';
import { PhoneListenerSkill } from './phone-listener/index.js';
import { CrmConnectorSkill } from './crm-connector/index.js';
import { CalendarManagerSkill } from './calendar-manager/index.js';
import { AdsManagerSkill } from './ads-manager/index.js';
import { ReviewRequesterSkill } from './review-requester/index.js';
import { DocumentGeneratorSkill } from './document-generator/index.js';
import { FirecrawlSkill } from './firecrawl/index.js';

/**
 * Map of built-in skill constructors.
 */
const BUILTIN_CONSTRUCTORS: Record<string, new () => ApexSkill> = {
  'web-browser': WebBrowserSkill,
  'email-reader': EmailReaderSkill,
  'phone-listener': PhoneListenerSkill,
  'crm-connector': CrmConnectorSkill,
  'calendar-manager': CalendarManagerSkill,
  'ads-manager': AdsManagerSkill,
  'review-requester': ReviewRequesterSkill,
  'document-generator': DocumentGeneratorSkill,
  'firecrawl': FirecrawlSkill,
};

export class SkillLoader {
  private sandbox: SkillSandbox;
  private registry: SkillRegistry;

  /** Cache of initialized skill instances per company+skill key */
  private instanceCache: Map<string, ApexSkill> = new Map();

  constructor(sandbox: SkillSandbox, registry: SkillRegistry) {
    this.sandbox = sandbox;
    this.registry = registry;
  }

  /**
   * Execute a skill method on behalf of an agent.
   * This is the main entry point for all skill invocations.
   */
  async executeSkill(
    companyId: string,
    agentId: string,
    skillName: string,
    method: string,
    params: Record<string, unknown>,
    skillConfig: Record<string, string>,
    issueId?: string
  ): Promise<SkillExecutionResult> {
    // Step 1: Look up skill in registry
    const registryEntry = await this.registry.getSkill(companyId, skillName);
    if (!registryEntry) {
      return {
        success: false,
        error: `Skill '${skillName}' is not installed for this company`,
        error_code: 'SKILL_NOT_FOUND',
        execution_time_ms: 0,
        sandbox_logs: [],
      };
    }

    // Step 2: Verify skill is enabled
    if (!registryEntry.enabled) {
      return {
        success: false,
        error: `Skill '${skillName}' is disabled`,
        error_code: 'SKILL_DISABLED',
        execution_time_ms: 0,
        sandbox_logs: [],
      };
    }

    // Step 3: Validate required config fields
    const configValidation = this.validateConfig(registryEntry, skillConfig);
    if (!configValidation.valid) {
      return {
        success: false,
        error: `Missing required config: ${configValidation.missing.join(', ')}`,
        error_code: 'CONFIG_MISSING',
        execution_time_ms: 0,
        sandbox_logs: [],
      };
    }

    // Step 4: Get or create skill instance
    const instance = await this.getInstance(companyId, skillName, skillConfig, registryEntry);
    if (!instance) {
      return {
        success: false,
        error: `Failed to instantiate skill '${skillName}'`,
        error_code: 'INSTANTIATION_FAILED',
        execution_time_ms: 0,
        sandbox_logs: [],
      };
    }

    // Step 5: Execute in sandbox
    const context: SkillExecutionContext = {
      company_id: companyId,
      agent_id: agentId,
      issue_id: issueId ?? null,
      config: skillConfig,
      permissions: registryEntry.permissions,
      timeout_ms: SANDBOX_DEFAULTS.TIMEOUT_MS,
      scratch_dir: SANDBOX_DEFAULTS.SCRATCH_DIR,
    };

    return this.sandbox.execute(skillName, instance, method, params, context);
  }

  /**
   * Preload and initialize all skills for a company.
   * Called during company activation to warm the cache.
   */
  async preloadCompanySkills(
    companyId: string,
    skillConfigs: Record<string, Record<string, string>>
  ): Promise<{ loaded: string[]; failed: string[] }> {
    const skills = await this.registry.listSkills(companyId);
    const loaded: string[] = [];
    const failed: string[] = [];

    for (const skill of skills) {
      if (!skill.enabled) continue;

      const config = skillConfigs[skill.name] ?? {};
      const instance = await this.getInstance(companyId, skill.name, config, skill);

      if (instance) {
        loaded.push(skill.name);
      } else {
        failed.push(skill.name);
      }
    }

    return { loaded, failed };
  }

  /**
   * Shut down all cached skill instances for a company.
   * Called during company deactivation or server shutdown.
   */
  async shutdownCompanySkills(companyId: string): Promise<void> {
    const keysToRemove: string[] = [];

    for (const [key, instance] of this.instanceCache.entries()) {
      if (key.startsWith(`${companyId}:`)) {
        try {
          await instance.shutdown();
        } catch {
          // Best-effort shutdown — log but don't throw
        }
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.instanceCache.delete(key);
    }
  }

  /**
   * Clear the entire instance cache. Used during testing.
   */
  async clearCache(): Promise<void> {
    for (const instance of this.instanceCache.values()) {
      try {
        await instance.shutdown();
      } catch {
        // Best-effort
      }
    }
    this.instanceCache.clear();
  }

  /**
   * List available methods for a skill (introspection).
   */
  getSkillMethods(skillName: string): string[] {
    const methodMap: Record<string, string[]> = {
      'web-browser': ['navigate', 'screenshot', 'extractText', 'fillForm'],
      'email-reader': ['getUnread', 'searchEmails', 'sendEmail', 'getThread'],
      'phone-listener': ['getRecentEvents', 'sendSms', 'initiateCall', 'getVoicemail'],
      'crm-connector': ['getContacts', 'createContact', 'getJobs', 'createJob', 'getBookings', 'updateJob', 'checkComplaints'],
      'calendar-manager': ['getEvents', 'createEvent', 'updateEvent', 'deleteEvent', 'checkAvailability'],
      'ads-manager': ['getCampaigns', 'createCampaign', 'pauseCampaign', 'getPerformance', 'updateBudget'],
      'review-requester': ['sendRequest', 'checkStatus', 'getReviewStats'],
      'document-generator': ['generateDocument', 'listTemplates', 'renderTemplate'],
      'firecrawl': ['scrape', 'crawl', 'crawlStatus', 'search', 'extract', 'map'],
    };
    return methodMap[skillName] ?? [];
  }

  // --- Private helpers ---

  private cacheKey(companyId: string, skillName: string): string {
    return `${companyId}:${skillName}`;
  }

  private async getInstance(
    companyId: string,
    skillName: string,
    config: Record<string, string>,
    registryEntry: SkillRegistryEntry
  ): Promise<ApexSkill | null> {
    const key = this.cacheKey(companyId, skillName);

    // Return cached instance if available
    if (this.instanceCache.has(key)) {
      return this.instanceCache.get(key)!;
    }

    try {
      let instance: ApexSkill;

      if (registryEntry.is_builtin) {
        // Built-in: instantiate from constructor map
        const Constructor = BUILTIN_CONSTRUCTORS[skillName];
        if (!Constructor) {
          return null;
        }
        instance = new Constructor();
      } else {
        // External skills: in production, this would load from the stored skill code
        // For now, return null for external skills (they'd be loaded from DB)
        return null;
      }

      // Initialize with company-specific config
      await instance.initialize(config);

      // Cache for reuse
      this.instanceCache.set(key, instance);
      return instance;
    } catch {
      return null;
    }
  }

  private validateConfig(
    registryEntry: SkillRegistryEntry,
    config: Record<string, string>
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    for (const [field, schema] of Object.entries(registryEntry.config_schema)) {
      if (schema.required && !config[field]) {
        missing.push(field);
      }
    }

    return { valid: missing.length === 0, missing };
  }
}
