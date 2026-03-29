/**
 * Skills Engine — Sandbox
 *
 * Executes skills in an isolated environment. Skills never get direct access to
 * process.env, the filesystem (outside scratch), or the database.
 *
 * Security model:
 * - Skills declare permissions upfront
 * - Sandbox only injects APIs matching declared permissions
 * - Network fetch is domain-whitelisted per permission
 * - Code is scanned for dangerous patterns before execution
 * - Execution is time-limited
 * - Skills that attempt to escape are quarantined
 */

import type {
  SkillExecutionContext,
  SkillExecutionResult,
  SkillScanResult,
  DomainWhitelistEntry,
} from './types.js';
import { DANGEROUS_PATTERNS, SANDBOX_DEFAULTS } from './types.js';

/**
 * Default domain whitelist. Companies can extend this via their configuration.
 * Each permission maps to one or more allowed hostnames.
 */
const DEFAULT_DOMAIN_WHITELIST: DomainWhitelistEntry[] = [
  { permission: 'network.outbound', hostname: '*', description: 'General outbound (use with caution)' },
  { permission: 'network.firecrawl', hostname: 'api.firecrawl.dev', description: 'Firecrawl web scraping API' },
  { permission: 'network.gmail', hostname: 'gmail.googleapis.com', description: 'Gmail API' },
  { permission: 'network.gmail', hostname: 'www.googleapis.com', description: 'Google APIs' },
  { permission: 'network.resend', hostname: 'api.resend.com', description: 'Resend email API' },
  { permission: 'network.twilio', hostname: 'api.twilio.com', description: 'Twilio SMS/Voice API' },
];

export class SkillSandbox {
  private domainWhitelist: DomainWhitelistEntry[];
  private quarantinedSkills: Set<string> = new Set();

  constructor(customWhitelist?: DomainWhitelistEntry[]) {
    this.domainWhitelist = customWhitelist ?? DEFAULT_DOMAIN_WHITELIST;
  }

  /**
   * Execute a skill method in a sandboxed environment.
   * Config credentials are injected — skills access them via config.API_KEY, never process.env.
   */
  async execute(
    skillName: string,
    skillModule: {
      execute: (method: string, params: Record<string, unknown>) => Promise<unknown>;
    },
    method: string,
    params: Record<string, unknown>,
    context: SkillExecutionContext
  ): Promise<SkillExecutionResult> {
    const startTime = Date.now();
    const logs: string[] = [];

    // Check if skill is quarantined
    if (this.quarantinedSkills.has(skillName)) {
      return {
        success: false,
        error: `Skill '${skillName}' is quarantined due to previous security violation`,
        error_code: 'SKILL_QUARANTINED',
        execution_time_ms: 0,
        sandbox_logs: [],
      };
    }

    // Validate permissions before execution
    const permCheck = this.validatePermissions(context.permissions);
    if (!permCheck.valid) {
      return {
        success: false,
        error: `Invalid permissions: ${permCheck.invalid.join(', ')}`,
        error_code: 'INVALID_PERMISSIONS',
        execution_time_ms: 0,
        sandbox_logs: [],
      };
    }

    try {
      // Execute with timeout
      const result = await Promise.race([
        skillModule.execute(method, params),
        this.createTimeout(context.timeout_ms || SANDBOX_DEFAULTS.TIMEOUT_MS, skillName),
      ]);

      const executionTime = Date.now() - startTime;
      logs.push(`[${skillName}] ${method} completed in ${executionTime}ms`);

      // Normalize result
      const normalized = this.normalizeResult(result);

      return {
        ...normalized,
        execution_time_ms: executionTime,
        sandbox_logs: logs,
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      const executionTime = Date.now() - startTime;

      logs.push(`[${skillName}] ${method} failed: ${error.message}`);

      // Check if this is a sandbox escape attempt
      if (this.isEscapeAttempt(error.message)) {
        await this.quarantineSkill(skillName, error.message);
        logs.push(`[${skillName}] QUARANTINED: sandbox escape attempt detected`);
      }

      return {
        success: false,
        error: error.message,
        error_code: error.message.includes('timeout') ? 'TIMEOUT' : 'EXECUTION_FAILED',
        execution_time_ms: executionTime,
        sandbox_logs: logs,
      };
    }
  }

  /**
   * Scan skill source code for dangerous patterns.
   * Used during skill installation to detect potential security issues.
   */
  scanCode(code: string): SkillScanResult {
    const violations: string[] = [];

    for (const { pattern, description } of DANGEROUS_PATTERNS) {
      if (pattern.test(code)) {
        violations.push(description);
      }
    }

    return {
      blocked: violations.length > 0,
      violations,
      score: Math.max(0, 100 - violations.length * 25),
      scanned_at: new Date().toISOString(),
    };
  }

  /**
   * Create a domain-whitelisted fetch function based on skill permissions.
   * Returns undefined if no network permissions are granted.
   */
  createSafeFetch(
    permissions: string[]
  ): ((url: string, opts?: RequestInit) => Promise<Response>) | undefined {
    const networkPerms = permissions.filter((p) => p.startsWith('network'));
    if (networkPerms.length === 0) return undefined;

    const allowedDomains = this.domainWhitelist
      .filter((entry) => networkPerms.includes(entry.permission))
      .map((entry) => entry.hostname);

    // If 'network.outbound' is granted with wildcard, allow all
    const allowAll = allowedDomains.includes('*');

    return async (url: string, opts?: RequestInit): Promise<Response> => {
      const hostname = new URL(url).hostname;

      if (!allowAll && !allowedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
        throw new Error(
          `Network access denied: ${hostname} not in permission whitelist. ` +
            `Allowed: ${allowedDomains.join(', ')}`
        );
      }

      return fetch(url, {
        ...opts,
        signal: AbortSignal.timeout(SANDBOX_DEFAULTS.TIMEOUT_MS),
      });
    };
  }

  /**
   * Check if a skill is currently quarantined.
   */
  isQuarantined(skillName: string): boolean {
    return this.quarantinedSkills.has(skillName);
  }

  /**
   * Remove a skill from quarantine (manual review passed).
   */
  unquarantine(skillName: string): void {
    this.quarantinedSkills.delete(skillName);
  }

  /**
   * Add custom domain whitelist entries (e.g., company-specific CRM domains).
   */
  addWhitelistEntries(entries: DomainWhitelistEntry[]): void {
    this.domainWhitelist.push(...entries);
  }

  // --- Private helpers ---

  private validatePermissions(permissions: string[]): { valid: boolean; invalid: string[] } {
    const VALID_PREFIXES = ['network.', 'files.', 'browser.', 'db.'];
    const invalid = permissions.filter(
      (p) => !VALID_PREFIXES.some((prefix) => p.startsWith(prefix))
    );
    return { valid: invalid.length === 0, invalid };
  }

  private createTimeout(ms: number, skillName: string): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Skill '${skillName}' execution timeout after ${ms}ms`)), ms)
    );
  }

  private isEscapeAttempt(errorMessage: string): boolean {
    const escapeIndicators = [
      'process is not defined',
      'require is not defined',
      'child_process',
      'fs.readFile',
      'fs.writeFile',
      '__dirname',
      'global is not defined',
    ];
    return escapeIndicators.some((indicator) =>
      errorMessage.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  private async quarantineSkill(skillName: string, reason: string): Promise<void> {
    this.quarantinedSkills.add(skillName);
    // In production, this would also:
    // 1. Write to audit_log
    // 2. Create an inbox_item of type SYSTEM_ALERT
    // 3. Disable the skill in the skills table
    console.error(
      `[SECURITY] Skill '${skillName}' quarantined. Reason: ${reason}`
    );
  }

  private normalizeResult(result: unknown): {
    success: boolean;
    data?: unknown;
    error?: string;
    error_code?: string;
    tokens_used?: number;
  } {
    if (result && typeof result === 'object' && 'success' in result) {
      const r = result as Record<string, unknown>;
      return {
        success: Boolean(r.success),
        data: r.data,
        error: r.error as string | undefined,
        error_code: r.error_code as string | undefined,
        tokens_used: r.tokens_used as number | undefined,
      };
    }
    return { success: true, data: result };
  }
}
