/**
 * Freemium plan limits — enforced server-side at the API layer.
 * Never trust frontend-only checks.
 */

export interface PlanLimits {
  max_companies: number;            // -1 = unlimited
  max_agents_per_company: number;   // -1 = unlimited
  max_issues_per_month: number;     // -1 = unlimited
  max_tokens_per_month: number;     // -1 = unlimited
  marketplace_access: boolean;
  byoa_protocol: boolean;
  plugin_system: boolean;
  see_enabled: boolean;
  support: 'community' | 'email' | 'priority' | 'dedicated';
  custom_skills: boolean;
  export_templates: boolean;
}

export type PlanName = 'free' | 'starter' | 'professional' | 'enterprise';

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    max_companies: 1,
    max_agents_per_company: 3,
    max_issues_per_month: 50,
    max_tokens_per_month: 100000,
    marketplace_access: false,
    byoa_protocol: false,
    plugin_system: false,
    see_enabled: false,
    support: 'community',
    custom_skills: false,
    export_templates: false,
  },
  starter: {
    max_companies: 3,
    max_agents_per_company: 10,
    max_issues_per_month: 500,
    max_tokens_per_month: 1000000,
    marketplace_access: true,
    byoa_protocol: false,
    plugin_system: false,
    see_enabled: false,
    support: 'email',
    custom_skills: true,
    export_templates: true,
  },
  professional: {
    max_companies: 10,
    max_agents_per_company: 50,
    max_issues_per_month: 5000,
    max_tokens_per_month: 10000000,
    marketplace_access: true,
    byoa_protocol: true,
    plugin_system: true,
    see_enabled: true,
    support: 'priority',
    custom_skills: true,
    export_templates: true,
  },
  enterprise: {
    max_companies: -1,
    max_agents_per_company: -1,
    max_issues_per_month: -1,
    max_tokens_per_month: -1,
    marketplace_access: true,
    byoa_protocol: true,
    plugin_system: true,
    see_enabled: true,
    support: 'dedicated',
    custom_skills: true,
    export_templates: true,
  },
} as const;

/**
 * Stripe price mapping
 */
export const STRIPE_PRICES = {
  starter: {
    monthly: 2900,   // $29/mo in cents
    yearly: 29000,   // $290/yr in cents
  },
  professional: {
    monthly: 9900,
    yearly: 99000,
  },
  enterprise: {
    monthly: 29900,
    yearly: 299000,
  },
} as const;

/**
 * Check if a limit value means "unlimited"
 */
export function isUnlimited(value: number): boolean {
  return value === -1;
}

/**
 * Get display name for a plan
 */
export function getPlanDisplayName(plan: PlanName): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}
