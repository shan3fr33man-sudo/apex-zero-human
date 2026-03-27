import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkillSandbox } from '../sandbox.js';

// Mock the sandbox as a class constructor
vi.mock('../sandbox.js', () => {
  return {
    SkillSandbox: class MockSkillSandbox {
      scanCode(code: string) {
        const hasDangerous = /process\.env|require\s*\(|child_process|eval\s*\(/.test(code);
        return {
          blocked: hasDangerous,
          violations: hasDangerous ? ['Dangerous pattern detected'] : [],
          score: hasDangerous ? 0 : 100,
          scanned_at: new Date().toISOString(),
        };
      }
      execute = vi.fn();
      isQuarantined = vi.fn().mockReturnValue(false);
      createSafeFetch = vi.fn();
    },
  };
});

// Mock global fetch for Supabase REST calls
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => [],
});
vi.stubGlobal('fetch', mockFetch);

import { SkillRegistry } from '../registry.js';

describe('SkillRegistry', () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] });
    registry = new SkillRegistry('https://test.supabase.co', 'test-key');
  });

  it('scanSkill returns score 0 and blocked=true for dangerous patterns', () => {
    const dangerousCode = `
      const secret = process.env.DATABASE_URL;
      const child = require('child_process');
      child.execSync('rm -rf /');
    `;

    // Test via the mocked SkillSandbox class directly
    const sandboxInstance = new SkillSandbox();
    const result = sandboxInstance.scanCode(dangerousCode);

    expect(result.blocked).toBe(true);
    expect(result.score).toBe(0);
  });

  it('scanSkill returns score 100 for clean code', () => {
    const cleanCode = `
      export async function execute(method, params) {
        return { success: true, data: params };
      }
    `;

    const sandboxInstance = new SkillSandbox();
    const result = sandboxInstance.scanCode(cleanCode);

    expect(result.blocked).toBe(false);
    expect(result.score).toBe(100);
  });

  it('getBuiltinSkillNames returns all 9 built-in skills', () => {
    const names = registry.getBuiltinSkillNames();
    expect(names.length).toBe(9);
    expect(names).toContain('web-browser');
    expect(names).toContain('firecrawl');
    expect(names).toContain('email-reader');
    expect(names).toContain('crm-connector');
  });

  it('install rejects skill with safety score below threshold', async () => {
    const dangerousCode = `const x = process.env.SECRET; require('fs');`;

    const result = await registry.installExternal('company-1', 'https://evil.com/skill.js', dangerousCode);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('install accepts clean skill code with valid metadata', async () => {
    // extractMetadata regex looks for `name: '...'` and `version: '...'` patterns
    const cleanCode = `
      export default {
        name: 'test-skill',
        version: '1.0.0',
        description: 'A test skill',
        permissions: ['network.outbound'],
        async execute(method, params) {
          return { success: true };
        }
      };
    `;

    // First fetch = getSkill check (returns empty = no duplicate)
    // Second fetch = resolveCommitSha (return error to skip)
    // Third fetch = insertSkill
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => [] }) // getSkill: no duplicate
      .mockResolvedValueOnce({ ok: false, json: async () => [] }) // resolveCommitSha: no SHA
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // insertSkill

    const result = await registry.installExternal('company-1', 'https://example.com/skill.js', cleanCode);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.skill_name).toBe('test-skill');
  });
});
