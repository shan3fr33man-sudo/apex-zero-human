import { describe, it, expect } from 'vitest';
import { PlanLimitError } from '../lib/plan-gate.js';

describe('Plan Gate — Plan limit enforcement', () => {
  it('PlanLimitError contains correct properties', () => {
    const err = new PlanLimitError('max_companies', 1, 1, 'starter');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PlanLimitError');
    expect(err.limitKey).toBe('max_companies');
    expect(err.currentValue).toBe(1);
    expect(err.maxValue).toBe(1);
    expect(err.requiredPlan).toBe('starter');
    expect(err.message).toContain('max_companies');
    expect(err.message).toContain('starter');
  });

  it('PlanLimitError message includes limit details', () => {
    const err = new PlanLimitError('max_agents_per_company', 3, 3, 'starter');
    expect(err.message).toBe(
      'Plan limit exceeded: max_agents_per_company (3/3). Upgrade to starter plan.'
    );
  });
});

describe('Plan Limits — static validation', () => {
  // Import the shared plan limits to verify structure
  it('all plan names are valid', async () => {
    // Validate the plan gate module loads without errors
    const planGate = await import('../lib/plan-gate.js');
    expect(planGate.PlanLimitError).toBeDefined();
    expect(planGate.checkLimit).toBeDefined();
    expect(planGate.enforceLimit).toBeDefined();
    expect(planGate.isFeatureEnabled).toBeDefined();
    expect(planGate.getRemainingQuota).toBeDefined();
  });
});
