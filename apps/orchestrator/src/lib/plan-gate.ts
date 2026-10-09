/**
 * Plan Gate — server-side enforcement of freemium limits.
 * Checks tenant plan and enforces limits on all gated actions.
 */
import { getSupabaseAdmin } from './supabase.js';
import { createLogger } from './logger.js';

const log = createLogger('PlanGate');

export type PlanName = 'free' | 'starter' | 'professional' | 'enterprise';

export interface PlanLimits {
  max_companies: number;
  max_agents_per_company: number;
  max_issues_per_month: number;
  max_tokens_per_month: number;
  marketplace_access: boolean;
  byoa_protocol: boolean;
  plugin_system: boolean;
  see_enabled: boolean;
  custom_skills: boolean;
  export_templates: boolean;
}

const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    max_companies: 1, max_agents_per_company: 3, max_issues_per_month: 50,
    max_tokens_per_month: 100000, marketplace_access: false, byoa_protocol: false,
    plugin_system: false, see_enabled: false, custom_skills: false, export_templates: false,
  },
  starter: {
    max_companies: 3, max_agents_per_company: 10, max_issues_per_month: 500,
    max_tokens_per_month: 1000000, marketplace_access: true, byoa_protocol: false,
    plugin_system: false, see_enabled: false, custom_skills: true, export_templates: true,
  },
  professional: {
    max_companies: 10, max_agents_per_company: 50, max_issues_per_month: 5000,
    max_tokens_per_month: 10000000, marketplace_access: true, byoa_protocol: true,
    plugin_system: true, see_enabled: true, custom_skills: true, export_templates: true,
  },
  enterprise: {
    max_companies: -1, max_agents_per_company: -1, max_issues_per_month: -1,
    max_tokens_per_month: -1, marketplace_access: true, byoa_protocol: true,
    plugin_system: true, see_enabled: true, custom_skills: true, export_templates: true,
  },
};

export class PlanLimitError extends Error {
  public limitKey: string;
  public currentValue: number;
  public maxValue: number;
  public requiredPlan: PlanName;

  constructor(limitKey: string, currentValue: number, maxValue: number, requiredPlan: PlanName) {
    super(`Plan limit exceeded: ${limitKey} (${currentValue}/${maxValue}). Upgrade to ${requiredPlan} plan.`);
    this.name = 'PlanLimitError';
    this.limitKey = limitKey;
    this.currentValue = currentValue;
    this.maxValue = maxValue;
    this.requiredPlan = requiredPlan;
  }
}

/**
 * Get the tenant's plan from the database.
 */
async function getTenantPlan(tenantId: string): Promise<PlanName> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from('tenants').select('plan').eq('id', tenantId).single();
  return (data?.plan as PlanName) ?? 'free';
}

/**
 * Get tenant ID from company ID (company → org → tenant).
 */
export async function getTenantIdFromCompany(companyId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data: company } = await supabase.from('companies').select('org_id').eq('id', companyId).single();
  if (!company) throw new Error('Company not found');
  const { data: org } = await supabase.from('organizations').select('tenant_id').eq('id', company.org_id).single();
  if (!org) throw new Error('Organization not found');
  return org.tenant_id;
}

/**
 * Get tenant ID from org ID.
 */
export async function getTenantIdFromOrg(orgId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data: org } = await supabase.from('organizations').select('tenant_id').eq('id', orgId).single();
  if (!org) throw new Error('Organization not found');
  return org.tenant_id;
}

/**
 * Check if a numeric limit is within plan allowance.
 */
export async function checkLimit(
  tenantId: string,
  limitKey: keyof PlanLimits,
  currentCount: number
): Promise<boolean> {
  const plan = await getTenantPlan(tenantId);
  const limits = PLAN_LIMITS[plan];
  const maxValue = limits[limitKey];

  if (typeof maxValue === 'boolean') return maxValue;
  if (maxValue === -1) return true; // unlimited
  return currentCount < maxValue;
}

/**
 * Enforce a numeric limit — throws PlanLimitError if exceeded.
 */
export async function enforceLimit(
  tenantId: string,
  limitKey: keyof PlanLimits,
  currentCount: number
): Promise<void> {
  const plan = await getTenantPlan(tenantId);
  const limits = PLAN_LIMITS[plan];
  const maxValue = limits[limitKey];

  if (typeof maxValue === 'boolean') {
    if (!maxValue) {
      const requiredPlan = findMinimumPlan(limitKey);
      throw new PlanLimitError(limitKey, 0, 0, requiredPlan);
    }
    return;
  }

  if (maxValue === -1) return; // unlimited

  if (currentCount >= maxValue) {
    const requiredPlan = findUpgradePlan(plan, limitKey);
    throw new PlanLimitError(limitKey, currentCount, maxValue, requiredPlan);
  }
}

/**
 * Check if a boolean feature is enabled for the tenant's plan.
 */
export async function isFeatureEnabled(tenantId: string, feature: keyof PlanLimits): Promise<boolean> {
  const plan = await getTenantPlan(tenantId);
  const limits = PLAN_LIMITS[plan];
  const value = limits[feature];
  return typeof value === 'boolean' ? value : true;
}

/**
 * Get remaining quota for a numeric limit.
 */
export async function getRemainingQuota(
  tenantId: string,
  limitKey: keyof PlanLimits,
  currentCount: number
): Promise<number> {
  const plan = await getTenantPlan(tenantId);
  const limits = PLAN_LIMITS[plan];
  const maxValue = limits[limitKey];

  if (typeof maxValue === 'boolean') return maxValue ? Infinity : 0;
  if (maxValue === -1) return Infinity;
  return Math.max(0, maxValue - currentCount);
}

/**
 * Find the minimum plan that enables a boolean feature.
 */
function findMinimumPlan(feature: keyof PlanLimits): PlanName {
  const plans: PlanName[] = ['free', 'starter', 'professional', 'enterprise'];
  for (const plan of plans) {
    const val = PLAN_LIMITS[plan][feature];
    if (typeof val === 'boolean' && val) return plan;
    if (typeof val === 'number' && val !== 0) return plan;
  }
  return 'enterprise';
}

/**
 * Find the next plan up from current that has a higher limit.
 */
function findUpgradePlan(currentPlan: PlanName, limitKey: keyof PlanLimits): PlanName {
  const planOrder: PlanName[] = ['free', 'starter', 'professional', 'enterprise'];
  const currentIndex = planOrder.indexOf(currentPlan);
  const currentValue = PLAN_LIMITS[currentPlan][limitKey];

  for (let i = currentIndex + 1; i < planOrder.length; i++) {
    const plan = planOrder[i];
    const val = PLAN_LIMITS[plan][limitKey];
    if (typeof val === 'number' && (val === -1 || val > (currentValue as number))) return plan;
    if (typeof val === 'boolean' && val) return plan;
  }
  return 'enterprise';
}
