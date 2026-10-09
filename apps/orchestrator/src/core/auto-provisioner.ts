/**
 * Auto-Provisioner — Deploys teams from templates without human approval
 *
 * When the Command Classifier detects BUILD_TEAM intent, this module:
 * 1. Loads the matching template from /templates/
 * 2. Checks budget headroom
 * 3. Detects duplicate teams
 * 4. Creates all agents, routines, and skills
 * 5. Creates a "kickoff" issue for the team lead
 *
 * Safety guardrails (invisible to user):
 * - Max 10 agents per auto-provision
 * - Must have budget for at least 1 hour of work
 * - Duplicate team detection
 * - Confidence threshold: auto-provision only if classifier confidence > 80%
 */
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';
import type { ExportedTemplate } from './template-export.js';
import type { CommandIntent } from './command-classifier.js';
import * as fs from 'fs';
import * as path from 'path';

const log = createLogger('AutoProvisioner');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_AGENTS_PER_PROVISION = 10;
const MIN_BUDGET_HEADROOM = 50000; // ~50K tokens minimum remaining
const MIN_CONFIDENCE = 80;

// Model mapping from template tier names to actual model strings
const MODEL_FOR_TIER: Record<string, string> = {
  STRATEGIC: 'claude-sonnet-4-6',
  TECHNICAL: 'claude-sonnet-4-6',
  ROUTINE: 'claude-haiku-4-5-20251001',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProvisionResult {
  success: boolean;
  companyId: string;
  teamType: string;
  agentsCreated: number;
  routinesCreated: number;
  leadAgentId: string | null;
  kickoffIssueId: string | null;
  message: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Template Loading
// ---------------------------------------------------------------------------

/**
 * Find the templates directory. Works in dev and production.
 */
function findTemplatesDir(): string {
  // Try relative to orchestrator (dev)
  const candidates = [
    path.resolve(process.cwd(), 'templates'),
    path.resolve(process.cwd(), '../../templates'),
    path.resolve(__dirname, '../../../../templates'),
    '/root/apex-zero-human/templates',
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  throw new Error('Templates directory not found');
}

/**
 * Load a template by name from the templates directory.
 */
export function loadTemplate(teamType: string): ExportedTemplate {
  const templatesDir = findTemplatesDir();
  const templatePath = path.join(templatesDir, teamType, 'template.json');

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${teamType}`);
  }

  const raw = fs.readFileSync(templatePath, 'utf-8');
  return JSON.parse(raw) as ExportedTemplate;
}

// ---------------------------------------------------------------------------
// Duplicate Detection
// ---------------------------------------------------------------------------

/**
 * Check if a company already has agents with roles from the given template.
 * Returns the list of conflicting roles.
 */
async function detectDuplicateRoles(
  companyId: string,
  template: ExportedTemplate,
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const templateRoles = template.agents.map(a => a.role.toLowerCase());

  const { data: existingAgents } = await supabase
    .from('agents')
    .select('role')
    .eq('company_id', companyId);

  if (!existingAgents || existingAgents.length === 0) return [];

  const existingRoles = new Set(
    (existingAgents as Array<{ role: string }>).map(a => a.role.toLowerCase()),
  );

  return templateRoles.filter(r => existingRoles.has(r));
}

// ---------------------------------------------------------------------------
// Budget Check
// ---------------------------------------------------------------------------

/**
 * Check if the company has enough budget headroom for provisioning.
 */
async function checkBudgetHeadroom(companyId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();

  const { data: company } = await supabase
    .from('companies')
    .select('token_budget')
    .eq('id', companyId)
    .single();

  if (!company) return false;
  const c = company as { token_budget: number };

  // Get total tokens used
  const { data: agents } = await supabase
    .from('agents')
    .select('tokens_used')
    .eq('company_id', companyId);

  const totalUsed = ((agents ?? []) as Array<{ tokens_used: number }>)
    .reduce((sum, a) => sum + (Number(a.tokens_used) || 0), 0);

  const remaining = c.token_budget - totalUsed;
  return remaining >= MIN_BUDGET_HEADROOM;
}

// ---------------------------------------------------------------------------
// Core Provisioning
// ---------------------------------------------------------------------------

/**
 * Auto-provision a team from a template into an existing company.
 *
 * Unlike TemplateExporter.importTemplate() which creates a NEW company,
 * this adds agents/routines to an EXISTING company.
 */
export async function provisionTeam(
  companyId: string,
  intent: CommandIntent,
): Promise<ProvisionResult> {
  const teamType = intent.team_type;
  const baseResult: Omit<ProvisionResult, 'success' | 'message'> = {
    companyId,
    teamType: teamType || 'unknown',
    agentsCreated: 0,
    routinesCreated: 0,
    leadAgentId: null,
    kickoffIssueId: null,
  };

  // Guard: confidence threshold
  if (intent.confidence < MIN_CONFIDENCE) {
    log.warn('Confidence too low for auto-provision', {
      confidence: intent.confidence,
      threshold: MIN_CONFIDENCE,
    });
    return {
      ...baseResult,
      success: false,
      message: `Confidence too low (${intent.confidence}%). Routing to CEO for manual handling.`,
    };
  }

  // Guard: team type required
  if (!teamType) {
    return {
      ...baseResult,
      success: false,
      message: 'No team type specified. Routing to CEO.',
    };
  }

  // Load template
  let template: ExportedTemplate;
  try {
    template = loadTemplate(teamType);
  } catch (err) {
    log.error('Template not found', { teamType, error: String(err) });
    return {
      ...baseResult,
      success: false,
      message: `No template found for "${teamType}". CEO will build a custom team.`,
      error: String(err),
    };
  }

  // Guard: max agents
  if (template.agents.length > MAX_AGENTS_PER_PROVISION) {
    log.warn('Template too large for auto-provision', {
      teamType,
      agentCount: template.agents.length,
      max: MAX_AGENTS_PER_PROVISION,
    });
    return {
      ...baseResult,
      success: false,
      message: `Template has ${template.agents.length} agents (max ${MAX_AGENTS_PER_PROVISION}). Requires approval.`,
    };
  }

  // Guard: budget
  const hasBudget = await checkBudgetHeadroom(companyId);
  if (!hasBudget) {
    log.warn('Insufficient budget for auto-provision', { companyId });
    return {
      ...baseResult,
      success: false,
      message: 'Insufficient token budget. Please add more credits before deploying a new team.',
    };
  }

  // Guard: duplicate roles
  const duplicates = await detectDuplicateRoles(companyId, template);
  if (duplicates.length > 0) {
    log.warn('Duplicate roles detected', { companyId, duplicates });
    return {
      ...baseResult,
      success: false,
      message: `You already have agents with these roles: ${duplicates.join(', ')}. Routing to CEO to decide how to handle.`,
    };
  }

  // ----- All guards passed — provision the team -----
  const supabase = getSupabaseAdmin();
  let agentsCreated = 0;
  let leadAgentId: string | null = null;

  // Get company info for persona customization
  const { data: companyData } = await supabase
    .from('companies')
    .select('name, description')
    .eq('id', companyId)
    .single();

  const companyName = (companyData as { name: string } | null)?.name || 'the company';
  const companyDesc = (companyData as { description: string | null } | null)?.description || '';

  // Find the CEO agent to set reports_to for team lead
  const { data: ceoAgent } = await supabase
    .from('agents')
    .select('id')
    .eq('company_id', companyId)
    .eq('role', 'ceo')
    .maybeSingle();

  const ceoId = (ceoAgent as { id: string } | null)?.id || null;

  // Create agents
  for (const agentTemplate of template.agents) {
    // Customize persona with company name
    const persona = agentTemplate.persona
      ? agentTemplate.persona.replace(/{{COMPANY_NAME}}/g, companyName)
      : `You are the ${agentTemplate.role} at ${companyName}. ${companyDesc}`;

    // Determine who this agent reports to
    let reportsTo: string | null = null;
    if (agentTemplate.reports_to_role === 'ceo') {
      reportsTo = ceoId;
    }
    // If reports_to is another role in this template, we'll link after creation

    const { data: newAgent, error } = await supabase
      .from('agents')
      .insert({
        company_id: companyId,
        name: agentTemplate.name,
        slug: agentTemplate.role.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        role: agentTemplate.role.toLowerCase(),
        persona,
        model: MODEL_FOR_TIER[agentTemplate.model_tier] || 'claude-sonnet-4-6',
        status: 'idle',
        reports_to: reportsTo,
        config: {
          model_tier: agentTemplate.model_tier,
          custom_rules: agentTemplate.custom_rules,
          installed_skills: agentTemplate.installed_skills,
        },
        tokens_used: 0,
        issues_completed: 0,
      })
      .select('id, role')
      .single();

    if (!error && newAgent) {
      agentsCreated++;
      const agent = newAgent as { id: string; role: string };

      // First agent in template is typically the team lead
      if (!leadAgentId && agentTemplate.reports_to_role === 'ceo') {
        leadAgentId = agent.id;
      }
    } else {
      log.error('Failed to create agent', {
        role: agentTemplate.role,
        error: error?.message,
      });
    }
  }

  // Link reports_to for non-CEO-reporting agents
  // (agents that report to other agents within this template)
  if (agentsCreated > 1) {
    // Get all newly created agents for this company
    const { data: allAgents } = await supabase
      .from('agents')
      .select('id, role')
      .eq('company_id', companyId);

    const roleToId = new Map<string, string>();
    for (const a of (allAgents ?? []) as Array<{ id: string; role: string }>) {
      roleToId.set(a.role.toLowerCase(), a.id);
    }

    for (const agentTemplate of template.agents) {
      if (agentTemplate.reports_to_role && agentTemplate.reports_to_role !== 'ceo') {
        const childId = roleToId.get(agentTemplate.role.toLowerCase());
        const parentId = roleToId.get(agentTemplate.reports_to_role.toLowerCase());
        if (childId && parentId) {
          await supabase
            .from('agents')
            .update({ reports_to: parentId })
            .eq('id', childId);
        }
      }
    }
  }

  // Create routines
  let routinesCreated = 0;
  for (const routineTemplate of template.routines) {
    const { error } = await supabase.from('routines').insert({
      company_id: companyId,
      name: routineTemplate.name,
      type: routineTemplate.type,
      schedule: routineTemplate.schedule,
      event_trigger: routineTemplate.event_trigger,
      issue_template: routineTemplate.issue_template,
      enabled: true,
    });

    if (!error) routinesCreated++;
  }

  // Create kickoff issue for the team lead
  let kickoffIssueId: string | null = null;
  if (leadAgentId) {
    const teamLabel = teamType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    const { data: kickoffIssue } = await supabase
      .from('issues')
      .insert({
        company_id: companyId,
        title: `${teamLabel} — Initial Setup & Strategy`,
        description: `## Team Deployed: ${teamLabel}

Your team has been automatically deployed. As team lead, your first task:

1. **Analyze the company**: Review ${companyName}'s business description and goals
2. **Create a strategy**: Develop a 30-day plan for your team
3. **Assign first tasks**: Break your strategy into specific issues for each team member
4. **Report to CEO**: Create a brief summary of your plan for the CEO

Company description: ${companyDesc || 'Not provided — research the company first.'}

This is your highest priority. Start immediately.`,
        status: 'open',
        priority: 'high',
        type: 'task',
        assigned_to: leadAgentId,
        metadata: {
          source: 'auto_provisioner',
          team_type: teamType,
          agents_created: agentsCreated,
          timestamp: new Date().toISOString(),
        },
      })
      .select('id')
      .single();

    if (kickoffIssue) {
      kickoffIssueId = (kickoffIssue as { id: string }).id;
    }
  }

  // Write to audit log
  await supabase.from('audit_log').insert({
    company_id: companyId,
    action: 'team_provisioned',
    details: {
      team_type: teamType,
      agents_created: agentsCreated,
      routines_created: routinesCreated,
      lead_agent_id: leadAgentId,
      kickoff_issue_id: kickoffIssueId,
    },
  });

  const teamLabel = teamType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  log.info('Team provisioned successfully', {
    companyId,
    teamType,
    agentsCreated,
    routinesCreated,
  });

  return {
    success: true,
    companyId,
    teamType,
    agentsCreated,
    routinesCreated,
    leadAgentId,
    kickoffIssueId,
    message: `${teamLabel} deployed — ${agentsCreated} agents ready. Your team lead is already planning.`,
  };
}
