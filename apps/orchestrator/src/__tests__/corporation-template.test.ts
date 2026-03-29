import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const TEMPLATE_DIR = join(__dirname, '../../../../templates/full-corporation');

describe('Full Corporation Template', () => {
  const templatePath = join(TEMPLATE_DIR, 'template.json');

  it('template.json exists and is valid JSON', () => {
    expect(existsSync(templatePath)).toBe(true);
    const raw = readFileSync(templatePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(data).toBeDefined();
    expect(data.id).toBe('full-corporation');
  });

  it('contains exactly 35 agents (with counts)', () => {
    const data = JSON.parse(readFileSync(templatePath, 'utf-8'));
    const totalAgents = data.agents.reduce(
      (sum: number, a: { count?: number }) => sum + (a.count ?? 1),
      0
    );
    expect(totalAgents).toBe(35);
  });

  it('all agents have required fields', () => {
    const data = JSON.parse(readFileSync(templatePath, 'utf-8'));
    const requiredFields = ['slug', 'name', 'role', 'model_tier', 'model', 'mission', 'kpis'];

    for (const agent of data.agents) {
      for (const field of requiredFields) {
        expect(agent[field], `Agent ${agent.slug} missing field: ${field}`).toBeDefined();
      }
    }
  });

  it('model tiers are valid', () => {
    const data = JSON.parse(readFileSync(templatePath, 'utf-8'));
    const validTiers = ['STRATEGIC', 'TECHNICAL', 'ROUTINE'];

    for (const agent of data.agents) {
      expect(
        validTiers.includes(agent.model_tier),
        `Agent ${agent.slug} has invalid tier: ${agent.model_tier}`
      ).toBe(true);
    }
  });

  it('hierarchy is valid (reports_to references existing slugs)', () => {
    const data = JSON.parse(readFileSync(templatePath, 'utf-8'));
    const slugs = new Set(data.agents.map((a: { slug: string }) => a.slug));

    for (const agent of data.agents) {
      if (agent.reports_to !== null) {
        expect(
          slugs.has(agent.reports_to),
          `Agent ${agent.slug} reports to non-existent: ${agent.reports_to}`
        ).toBe(true);
      }
    }
  });

  it('CEO is the only agent with no manager', () => {
    const data = JSON.parse(readFileSync(templatePath, 'utf-8'));
    const topLevel = data.agents.filter(
      (a: { reports_to: string | null }) => a.reports_to === null
    );
    expect(topLevel.length).toBe(1);
    expect(topLevel[0].slug).toBe('ceo');
  });

  it('every agent slug has a matching persona .md file', () => {
    const data = JSON.parse(readFileSync(templatePath, 'utf-8'));
    const agentsDir = join(TEMPLATE_DIR, 'agents');

    for (const agent of data.agents) {
      const personaPath = join(agentsDir, `${agent.slug}.md`);
      expect(
        existsSync(personaPath),
        `Missing persona file: agents/${agent.slug}.md`
      ).toBe(true);
    }
  });

  it('has at least 6 hierarchy levels', () => {
    const data = JSON.parse(readFileSync(templatePath, 'utf-8'));
    const roles = new Set(data.agents.map((a: { role: string }) => a.role));
    expect(roles.size).toBeGreaterThanOrEqual(6);
  });

  it('contains routines', () => {
    const data = JSON.parse(readFileSync(templatePath, 'utf-8'));
    expect(data.routines).toBeDefined();
    expect(data.routines.length).toBeGreaterThanOrEqual(5);
  });

  it('routines have required fields', () => {
    const data = JSON.parse(readFileSync(templatePath, 'utf-8'));
    for (const routine of data.routines) {
      expect(routine.id, 'Routine missing id').toBeDefined();
      expect(routine.name, 'Routine missing name').toBeDefined();
      expect(routine.type, 'Routine missing type').toBeDefined();
      expect(routine.assigned_role, 'Routine missing assigned_role').toBeDefined();
    }
  });
});
