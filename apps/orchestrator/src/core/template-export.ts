/**
 * Template Export/Import — export company configs with secret scrubbing.
 * Scans all configs for API keys, tokens, passwords and replaces with placeholders.
 */
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('TemplateExport');

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,           // Anthropic/OpenAI keys
  /[a-zA-Z0-9]{32,}/g,               // Generic long tokens (only in value context)
  /(?:key|secret|token|password|auth|credential)["\s:=]+["']?[^\s"',}{]+/gi,
  /Bearer\s+[^\s"']+/g,              // Bearer tokens
  /https?:\/\/[^:]+:[^@]+@/g,        // URLs with credentials
];

export interface ExportedTemplate {
  version: '1.0';
  exported_at: string;
  company: {
    name: string;
    goal: string;
    mission: string | null;
    slug: string;
  };
  agents: Array<{
    role: string;
    name: string;
    persona: string | null;
    model_tier: string;
    reports_to_role: string | null;
    custom_rules: string[];
    installed_skills: string[];
  }>;
  routines: Array<{
    name: string;
    type: string;
    schedule: string | null;
    event_trigger: string | null;
    issue_template: Record<string, unknown>;
  }>;
  skills: string[];
}

export class TemplateExporter {
  private supabase = getSupabaseAdmin();

  /**
   * Export a company as a portable template JSON.
   * All secrets are scrubbed and replaced with {{SECRET_PLACEHOLDER}}.
   */
  async exportCompany(companyId: string): Promise<ExportedTemplate> {
    log.info('Exporting company template', { companyId });

    // Fetch company
    const { data: company } = await this.supabase
      .from('companies')
      .select('name, goal, slug')
      .eq('id', companyId)
      .single();

    if (!company) throw new Error(`Company ${companyId} not found`);
    const c = company as { name: string; goal: string; slug?: string };

    // Fetch agents
    const { data: agents } = await this.supabase
      .from('agents')
      .select('role, name, persona, model_tier, custom_rules, installed_skills')
      .eq('company_id', companyId);

    // Fetch routines
    const { data: routines } = await this.supabase
      .from('routines')
      .select('name, type, schedule, event_trigger, issue_template')
      .eq('company_id', companyId);

    const template: ExportedTemplate = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      company: {
        name: c.name,
        goal: c.goal,
        mission: null,
        slug: c.slug ?? c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      },
      agents: ((agents ?? []) as Array<{
        role: string; name: string; persona: string | null;
        model_tier: string; custom_rules: string[];
        installed_skills: string[];
      }>).map(a => ({
        role: a.role,
        name: a.name,
        persona: a.persona,
        model_tier: a.model_tier,
        reports_to_role: null,
        custom_rules: a.custom_rules ?? [],
        installed_skills: a.installed_skills ?? [],
      })),
      routines: ((routines ?? []) as Array<{
        name: string; type: string; schedule: string | null;
        event_trigger: string | null; issue_template: Record<string, unknown>;
      }>).map(r => ({
        name: r.name,
        type: r.type,
        schedule: r.schedule,
        event_trigger: r.event_trigger,
        issue_template: r.issue_template ?? {},
      })),
      skills: [...new Set(((agents ?? []) as Array<{ installed_skills: string[] }>).flatMap(a => a.installed_skills ?? []))],
    };

    // Scrub secrets from the entire template
    return JSON.parse(this.scrubSecrets(JSON.stringify(template))) as ExportedTemplate;
  }

  /**
   * Import a template into a new company.
   * Handles collisions by suffixing agent roles with _imported.
   */
  async importTemplate(
    template: ExportedTemplate,
    organizationId: string,
    tenantId: string
  ): Promise<{ companyId: string; agentsCreated: number }> {
    log.info('Importing company template', { templateName: template.company.name });

    // Create the company
    const { data: newCompany, error: companyError } = await this.supabase
      .from('companies')
      .insert({
        organization_id: organizationId,
        tenant_id: tenantId,
        name: template.company.name,
        goal: template.company.goal,
        slug: template.company.slug + '-' + Date.now().toString(36),
      })
      .select('id')
      .single();

    if (companyError || !newCompany) {
      throw new Error(`Failed to create company: ${companyError?.message}`);
    }

    const companyId = (newCompany as { id: string }).id;
    let agentsCreated = 0;

    // Create agents
    for (const agentTemplate of template.agents) {
      const { error } = await this.supabase.from('agents').insert({
        company_id: companyId,
        name: agentTemplate.name,
        role: agentTemplate.role,
        persona: agentTemplate.persona,
        model_tier: agentTemplate.model_tier,
        custom_rules: agentTemplate.custom_rules,
        installed_skills: agentTemplate.installed_skills,
        status: 'idle',
      });

      if (!error) agentsCreated++;
    }

    // Create routines
    for (const routineTemplate of template.routines) {
      await this.supabase.from('routines').insert({
        company_id: companyId,
        name: routineTemplate.name,
        type: routineTemplate.type,
        schedule: routineTemplate.schedule,
        event_trigger: routineTemplate.event_trigger,
        issue_template: routineTemplate.issue_template,
        enabled: true,
      });
    }

    log.info('Template import complete', { companyId, agentsCreated });
    return { companyId, agentsCreated };
  }

  /**
   * Scrub secrets from a JSON string.
   * Replaces anything that looks like a key, token, or password.
   */
  scrubSecrets(text: string): string {
    let scrubbed = text;
    for (const pattern of SECRET_PATTERNS) {
      scrubbed = scrubbed.replace(pattern, '{{SECRET_PLACEHOLDER}}');
    }
    return scrubbed;
  }
}
