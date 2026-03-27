/**
 * Every APEX skill — built-in or external — must implement this interface.
 * Skills run in a sandboxed VM. They never access process.env or the database directly.
 */
export interface ApexSkill {
  readonly name: string;
  readonly version: string;
  readonly permissions: string[];
  readonly description: string;

  initialize(config: Record<string, string>): Promise<void>;
  execute(method: string, params: Record<string, unknown>): Promise<SkillResult>;
  shutdown(): Promise<void>;
}

export interface SkillResult {
  success: boolean;
  data?: unknown;
  error?: string;
  error_code?: string;
  tokens_used?: number;
}

/**
 * Approved skill permissions. Skills declare these upfront.
 * Any permission not listed here is automatically denied.
 */
export type SkillPermission =
  | 'network.outbound'
  | 'network.firecrawl'
  | 'network.ringcentral'
  | 'network.smartmoving'
  | 'network.google-ads'
  | 'network.gmail'
  | 'network.resend'
  | 'network.twilio'
  | 'files.read'
  | 'files.write'
  | 'browser.navigate'
  | 'browser.screenshot'
  | 'db.read';
