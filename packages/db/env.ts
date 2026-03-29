import { z } from 'zod';

/**
 * APEX Environment Variable Schema
 * Validates all required env vars at startup. Fail fast, fail loud.
 *
 * Usage:
 *   import { envSchema } from '@apex/db';
 *   const env = envSchema.web.parse(process.env);
 */

// --- Shared base schema (used by both web and orchestrator) ---
const supabaseBase = {
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().startsWith('https://'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
};

// --- Web (Next.js) environment ---
export const webEnvSchema = z.object({
  ...supabaseBase,
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_PROJECT_ID: z.string().min(5),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  RESEND_API_KEY: z.string().startsWith('re_'),
  FIRECRAWL_API_KEY: z.string().startsWith('fc-').optional(),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// --- Orchestrator environment ---
export const orchestratorEnvSchema = z.object({
  SUPABASE_URL: z.string().url().startsWith('https://'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  // RingCentral
  RINGCENTRAL_CLIENT_ID: z.string().min(1).optional(),
  RINGCENTRAL_CLIENT_SECRET: z.string().min(1).optional(),
  RINGCENTRAL_SERVER_URL: z.string().url().default('https://platform.ringcentral.com'),
  // SmartMoving
  SMARTMOVING_API_KEY: z.string().min(1).optional(),
  SMARTMOVING_BASE_URL: z.string().url().default('https://api.smartmoving.com'),
  // Firecrawl (web scraping for all agents)
  FIRECRAWL_API_KEY: z.string().startsWith('fc-'),
  // Email alerts
  RESEND_API_KEY: z.string().startsWith('re_').optional(),
  ALERT_EMAIL_TO: z.string().email().optional(),
  // Timers
  ORCHESTRATOR_TICK_MS: z.coerce.number().int().positive().default(5000),
  AUTOSCALER_TICK_MS: z.coerce.number().int().positive().default(30000),
  STALL_CHECK_MS: z.coerce.number().int().positive().default(300000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// --- SEE (Self-Evolution Engine) environment ---
export const seeEnvSchema = z.object({
  SUPABASE_URL: z.string().url().startsWith('https://'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  SEE_SHADOW_SUPABASE_URL: z.string().url().startsWith('https://'),
  SEE_SHADOW_SUPABASE_KEY: z.string().min(20),
  SEE_INTERNAL_ALERT_WEBHOOK: z.string().url().optional(),
  SEE_MODE: z.enum(['autonomous', 'manual', 'disabled']).default('autonomous'),
  SEE_DEPLOYMENT_WINDOW_START: z.coerce.number().int().min(0).max(23).default(2),
  SEE_DEPLOYMENT_WINDOW_END: z.coerce.number().int().min(0).max(23).default(4),
  SEE_MAX_BUDGET_PER_TEST_USD: z.coerce.number().positive().default(10),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Unified export
export const envSchema = {
  web: webEnvSchema,
  orchestrator: orchestratorEnvSchema,
  see: seeEnvSchema,
} as const;

export type WebEnvConfig = z.infer<typeof webEnvSchema>;
export type OrchestratorEnvConfig = z.infer<typeof orchestratorEnvSchema>;
export type SeeEnvConfig = z.infer<typeof seeEnvSchema>;
export type EnvConfig = WebEnvConfig | OrchestratorEnvConfig | SeeEnvConfig;
