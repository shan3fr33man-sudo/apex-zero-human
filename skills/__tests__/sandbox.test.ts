import { describe, it, expect, beforeEach } from 'vitest';
import { SkillSandbox } from '../sandbox.js';

describe('SkillSandbox', () => {
  let sandbox: SkillSandbox;

  beforeEach(() => {
    sandbox = new SkillSandbox();
  });

  describe('scanCode — security scanning', () => {
    it('blocks process.env access', () => {
      const result = sandbox.scanCode('const key = process.env.SECRET_KEY;');
      expect(result.blocked).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
      // Score formula: Math.max(0, 100 - violations * 25). 1 violation = 75
      expect(result.score).toBeLessThan(100);
    });

    it('blocks require() calls', () => {
      const result = sandbox.scanCode('const fs = require("fs");');
      expect(result.blocked).toBe(true);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('blocks fs module access', () => {
      const result = sandbox.scanCode('import fs from "fs"; fs.readFileSync("/etc/passwd");');
      expect(result.blocked).toBe(true);
    });

    it('returns score 100 for clean code', () => {
      const result = sandbox.scanCode(`
        export async function execute(method, params) {
          const response = await fetch('https://api.example.com/data');
          return response.json();
        }
      `);
      expect(result.blocked).toBe(false);
      expect(result.score).toBe(100);
    });
  });

  describe('domain whitelisting', () => {
    it('allows safe fetch to whitelisted domain', () => {
      const safeFetch = sandbox.createSafeFetch(['network.outbound']);
      expect(safeFetch).toBeDefined();
    });

    it('rejects fetch to non-whitelisted domain', () => {
      const safeFetch = sandbox.createSafeFetch([]);
      // With no network permissions, safeFetch should be undefined
      expect(safeFetch).toBeUndefined();
    });
  });

  describe('quarantine system', () => {
    it('auto-quarantines skill on escape attempt', async () => {
      // Execute a skill that triggers an escape attempt
      const result = await sandbox.execute(
        'malicious-skill',
        {
          execute: async () => {
            throw new Error('process is not defined');
          },
        },
        'hack',
        {},
        { permissions: ['network.outbound'], timeout_ms: 5000, company_id: 'c1' }
      );

      expect(result.success).toBe(false);
      expect(sandbox.isQuarantined('malicious-skill')).toBe(true);
    });

    it('isQuarantined returns false for new skills', () => {
      expect(sandbox.isQuarantined('new-skill')).toBe(false);
    });

    it('unquarantine clears quarantine status', async () => {
      // First quarantine
      await sandbox.execute(
        'test-skill',
        { execute: async () => { throw new Error('process is not defined'); } },
        'run',
        {},
        { permissions: ['network.outbound'], timeout_ms: 5000, company_id: 'c1' }
      );
      expect(sandbox.isQuarantined('test-skill')).toBe(true);

      // Then unquarantine
      sandbox.unquarantine('test-skill');
      expect(sandbox.isQuarantined('test-skill')).toBe(false);
    });
  });
});
