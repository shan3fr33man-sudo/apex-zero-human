/**
 * Skills Engine — Type Definitions
 *
 * Core types for the APEX skill system. Re-exports the shared interface
 * and adds engine-specific types for sandbox execution, registry, and loading.
 */

// Re-export the canonical skill interface from shared package
export type { ApexSkill, SkillResult, SkillPermission } from '../packages/shared/skill-interface.js';

/**
 * Skill metadata stored in the database registry.
 */
export interface SkillRegistryEntry {
  id: string;
  company_id: string;
  name: string;
  version: string;
  description: string;
  source_url: string | null;
  commit_sha: string | null;
  permissions: string[];
  safety_score: number;
  verified: boolean;
  is_builtin: boolean;
  enabled: boolean;
  config_schema: Record<string, SkillConfigField>;
  created_at: string;
  updated_at: string;
}

/**
 * Schema definition for a skill's configuration fields.
 * Used to validate config injection at runtime.
 */
export interface SkillConfigField {
  type: 'string' | 'number' | 'boolean' | 'url';
  required: boolean;
  description: string;
  default?: string | number | boolean;
}

/**
 * Result of a skill installation attempt.
 */
export interface SkillInstallResult {
  success: boolean;
  skill_name?: string;
  error?: string;
  scan_result?: SkillScanResult;
}

/**
 * Result of a skill security scan.
 */
export interface SkillScanResult {
  blocked: boolean;
  violations: string[];
  score: number;
  scanned_at: string;
}

/**
 * Skill execution context — passed to the sandbox at runtime.
 */
export interface SkillExecutionContext {
  company_id: string;
  agent_id: string;
  issue_id: string | null;
  config: Record<string, string>;
  permissions: string[];
  timeout_ms: number;
  scratch_dir: string;
}

/**
 * Skill execution result with timing and resource usage metadata.
 */
export interface SkillExecutionResult {
  success: boolean;
  data?: unknown;
  error?: string;
  error_code?: string;
  tokens_used?: number;
  execution_time_ms: number;
  sandbox_logs: string[];
}

/**
 * Domain whitelist entry mapping permissions to allowed hostnames.
 */
export interface DomainWhitelistEntry {
  permission: string;
  hostname: string;
  description: string;
}

/**
 * Dangerous code patterns that trigger quarantine during security scan.
 */
export const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /process\.env/, description: 'Direct environment variable access' },
  { pattern: /require\s*\(/, description: 'Dynamic require() call' },
  { pattern: /child_process/, description: 'Child process spawning' },
  { pattern: /eval\s*\(/, description: 'Dynamic code evaluation' },
  { pattern: /Function\s*\(/, description: 'Dynamic Function constructor' },
  { pattern: /fs\.\w+/, description: 'Direct filesystem access' },
  { pattern: /__dirname/, description: 'Directory name access' },
  { pattern: /__filename/, description: 'Filename access' },
  { pattern: /global\./, description: 'Global object access' },
  { pattern: /globalThis/, description: 'Global scope access' },
  { pattern: /Deno\./, description: 'Deno runtime access' },
  { pattern: /Bun\./, description: 'Bun runtime access' },
];

/**
 * Default sandbox limits.
 */
export const SANDBOX_DEFAULTS = {
  TIMEOUT_MS: 30_000,
  MAX_MEMORY_MB: 128,
  MAX_OUTPUT_LENGTH: 1_000_000,
  SCRATCH_DIR: '/tmp/apex-skill-scratch',
} as const;
