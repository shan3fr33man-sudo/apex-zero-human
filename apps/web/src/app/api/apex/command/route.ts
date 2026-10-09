/**
 * Command Bar API Route — Godmode Entry Point
 *
 * POST /api/apex/command
 *   Accept plain English commands from non-technical users.
 *   The Command Classifier analyzes intent and routes accordingly:
 *
 *   BUILD_TEAM → Auto-Provisioner deploys a team from templates
 *   EXECUTE_TASK → Creates issue for CEO or specific agent
 *   CONFIGURE → Creates configuration issue for CEO
 *   QUERY → Creates query issue for CEO
 *   UNKNOWN → Gentle error message with suggestions
 *
 * Request body: { command: string, company_id: string }
 * Response: { intent, result?, issue? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceRole, getAuthenticatedUser, requireOwnership } from '@/lib/supabase-server';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Command Classifier — inlined for Next.js (can't import from orchestrator)
// ---------------------------------------------------------------------------

type CommandIntentType = 'BUILD_TEAM' | 'EXECUTE_TASK' | 'CONFIGURE' | 'QUERY' | 'UNKNOWN';

interface CommandIntent {
  type: CommandIntentType;
  team_type: string | null;
  specific_task: string | null;
  confidence: number;
  requires_new_agents: boolean;
  estimated_complexity: 'simple' | 'moderate' | 'complex';
  suggested_roles: string[];
}

const TEAM_SYNONYMS: Record<string, string> = {
  'marketing': 'marketing-team', 'marketing team': 'marketing-team',
  'marketing department': 'marketing-team', 'content team': 'marketing-team',
  'content marketing': 'marketing-team', 'social media': 'marketing-team',
  'social media team': 'marketing-team', 'brand team': 'marketing-team',
  'growth team': 'marketing-team', 'growth': 'marketing-team',
  'sales': 'sales-team', 'sales team': 'sales-team',
  'sales department': 'sales-team', 'business development': 'sales-team',
  'biz dev': 'sales-team', 'revenue team': 'sales-team',
  'support': 'support-team', 'support team': 'support-team',
  'customer support': 'support-team', 'customer service': 'support-team',
  'help desk': 'support-team', 'service team': 'support-team',
  'customer success': 'support-team',
  'operations': 'operations-team', 'operations team': 'operations-team',
  'ops': 'operations-team', 'ops team': 'operations-team',
  'logistics': 'operations-team', 'process team': 'operations-team',
  'dev': 'dev-team', 'dev team': 'dev-team',
  'development team': 'dev-team', 'engineering': 'dev-team',
  'engineering team': 'dev-team', 'tech team': 'dev-team',
  'software team': 'dev-team', 'product team': 'dev-team',
  'finance': 'finance-team', 'finance team': 'finance-team',
  'accounting': 'finance-team', 'accounting team': 'finance-team',
  'bookkeeping': 'finance-team',
  'hr': 'hr-team', 'hr team': 'hr-team',
  'human resources': 'hr-team', 'recruiting': 'hr-team',
  'recruitment': 'hr-team', 'people team': 'hr-team', 'people ops': 'hr-team',
  'moving': 'moving-company', 'moving company': 'moving-company', 'movers': 'moving-company',
  'full company': 'full-corporation', 'entire company': 'full-corporation',
  'whole company': 'full-corporation', 'everything': 'full-corporation',
  'run my company': 'full-corporation', 'run my business': 'full-corporation',
};

function tryLocalClassify(command: string): CommandIntent | null {
  const lower = command.toLowerCase().trim();

  const teamPatterns = [
    /(?:act as|be|become|run|start|launch|set up|setup|build|create|deploy)\s+(?:my|our|a|the)?\s*(.+?)(?:\s+team|\s+department|\s+division)?$/i,
  ];

  for (const pattern of teamPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const extracted = match[1].trim().toLowerCase();
      const templateName = TEAM_SYNONYMS[extracted];
      if (templateName) {
        return {
          type: 'BUILD_TEAM',
          team_type: templateName,
          specific_task: null,
          confidence: 95,
          requires_new_agents: true,
          estimated_complexity: 'complex',
          suggested_roles: ['ceo'],
        };
      }
    }
  }

  for (const [synonym, templateName] of Object.entries(TEAM_SYNONYMS)) {
    if (lower === synonym || lower === `i need a ${synonym}` || lower === `i want a ${synonym}`) {
      return {
        type: 'BUILD_TEAM',
        team_type: templateName,
        specific_task: null,
        confidence: 90,
        requires_new_agents: true,
        estimated_complexity: 'complex',
        suggested_roles: ['ceo'],
      };
    }
  }

  return null;
}

async function classifyWithLLM(command: string): Promise<CommandIntent> {
  // Use dynamic import for Anthropic SDK to avoid build issues
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('No API key');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        temperature: 0,
        system: `You are a command classifier for an AI company platform. Classify the command into JSON:
{"type":"BUILD_TEAM"|"EXECUTE_TASK"|"CONFIGURE"|"QUERY"|"UNKNOWN","team_type":string|null,"specific_task":string|null,"confidence":number,"requires_new_agents":boolean,"estimated_complexity":"simple"|"moderate"|"complex","suggested_roles":string[]}
BUILD_TEAM team_type options: marketing-team, sales-team, support-team, operations-team, dev-team, finance-team, hr-team, moving-company, full-corporation, custom.
Available roles: ceo, engineer, qa, marketing, ux, dispatch, lead_recovery, quote, compliance, fleet_coordinator, review_request, eval_engineer.
Respond with ONLY JSON.`,
        messages: [{ role: 'user', content: command }],
      }),
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const parsed = JSON.parse(text) as CommandIntent;

    if (parsed.type === 'BUILD_TEAM' && parsed.team_type) {
      parsed.team_type = TEAM_SYNONYMS[parsed.team_type.toLowerCase()] || parsed.team_type;
    }

    return parsed;
  } catch {
    return {
      type: 'EXECUTE_TASK',
      team_type: null,
      specific_task: command,
      confidence: 30,
      requires_new_agents: false,
      estimated_complexity: 'moderate',
      suggested_roles: ['ceo'],
    };
  }
}

async function classifyCommand(command: string): Promise<CommandIntent> {
  const local = tryLocalClassify(command);
  if (local) return local;
  return classifyWithLLM(command);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const CreateCommandSchema = z.object({
  command: z.string()
    .min(1, 'Command cannot be empty')
    .max(2000, 'Command must be 2000 characters or less'),
  company_id: z.string()
    .uuid('Invalid company_id format'),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTitle(command: string): string {
  const cleaned = command.trim();
  if (cleaned.length <= 60) return cleaned;
  const truncated = cleaned.substring(0, 60);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 42) return truncated.substring(0, lastSpace) + '...';
  return truncated + '...';
}

function buildDescription(command: string, intent: CommandIntent): string {
  return `## Operator Command
The company operator has given you a direct command. This is your highest priority.

**Command:** ${command}

**Classified Intent:** ${intent.type} (confidence: ${intent.confidence}%)
${intent.specific_task ? `**Task:** ${intent.specific_task}` : ''}
${intent.suggested_roles.length > 0 ? `**Suggested Roles:** ${intent.suggested_roles.join(', ')}` : ''}

## Instructions
As CEO, analyze this command and take action:
1. If this requires new agents — propose a team and create a HIRE_APPROVAL inbox item
2. If this requires new routines — set them up
3. If this is a task for existing agents — break it into issues and assign them
4. If you need clarification — create an inbox item asking the operator

Always start by creating a plan, then execute it step by step.`;
}

// ---------------------------------------------------------------------------
// Model constants for auto-provisioner (inline since we can't import from orchestrator)
// ---------------------------------------------------------------------------

const MODEL_FOR_TIER: Record<string, string> = {
  STRATEGIC: 'claude-sonnet-4-6',
  TECHNICAL: 'claude-sonnet-4-6',
  ROUTINE: 'claude-haiku-4-5-20251001',
};

const KNOWN_TEMPLATES = [
  'marketing-team', 'sales-team', 'support-team', 'operations-team',
  'dev-team', 'finance-team', 'hr-team', 'moving-company', 'full-corporation',
];

// ---------------------------------------------------------------------------
// Auto-Provisioning (inline — reads templates from DB-stored or via API)
// ---------------------------------------------------------------------------

interface ProvisionResult {
  success: boolean;
  agentsCreated: number;
  routinesCreated: number;
  leadAgentId: string | null;
  kickoffIssueId: string | null;
  message: string;
}

async function provisionTeamInline(
  companyId: string,
  teamType: string,
  supabase: ReturnType<typeof getSupabaseServiceRole>,
): Promise<ProvisionResult> {
  // Load template via internal API or filesystem
  // For the Next.js route, we load templates via a helper
  let template: {
    agents: Array<{
      role: string; name: string; persona: string; model_tier: string;
      reports_to_role: string | null; custom_rules: string[]; installed_skills: string[];
    }>;
    routines: Array<{
      name: string; type: string; schedule: string | null;
      event_trigger: string | null; issue_template: Record<string, unknown>;
    }>;
  };

  try {
    // Read template from filesystem
    const fs = await import('fs');
    const path = await import('path');

    const candidates = [
      path.join(process.cwd(), 'templates', teamType, 'template.json'),
      path.join(process.cwd(), '..', '..', 'templates', teamType, 'template.json'),
      `/root/apex-zero-human/templates/${teamType}/template.json`,
    ];

    let raw: string | null = null;
    for (const p of candidates) {
      try {
        raw = fs.readFileSync(p, 'utf-8');
        break;
      } catch { continue; }
    }

    if (!raw) throw new Error('Template file not found');
    template = JSON.parse(raw);
  } catch {
    return {
      success: false, agentsCreated: 0, routinesCreated: 0,
      leadAgentId: null, kickoffIssueId: null,
      message: `Template "${teamType}" not found. CEO will build a custom team.`,
    };
  }

  // Check for duplicate roles
  const templateRoles = template.agents.map(a => a.role.toLowerCase());
  const { data: existingAgents } = await supabase
    .from('agents')
    .select('role')
    .eq('company_id', companyId);

  const existingRoles = new Set(
    ((existingAgents ?? []) as Array<{ role: string }>).map(a => a.role.toLowerCase()),
  );
  const duplicates = templateRoles.filter(r => existingRoles.has(r));

  if (duplicates.length > 0) {
    return {
      success: false, agentsCreated: 0, routinesCreated: 0,
      leadAgentId: null, kickoffIssueId: null,
      message: `You already have agents with these roles: ${duplicates.join(', ')}. CEO will handle this.`,
    };
  }

  // Get company info
  const { data: companyData } = await supabase
    .from('companies')
    .select('name, description')
    .eq('id', companyId)
    .single();

  const companyName = (companyData as { name: string } | null)?.name || 'the company';
  const companyDesc = (companyData as { description: string | null } | null)?.description || '';

  // Find CEO for reports_to
  const { data: ceoAgent } = await supabase
    .from('agents')
    .select('id')
    .eq('company_id', companyId)
    .eq('role', 'ceo')
    .maybeSingle();
  const ceoId = (ceoAgent as { id: string } | null)?.id || null;

  // Create agents
  let agentsCreated = 0;
  let leadAgentId: string | null = null;

  for (const agentTpl of template.agents) {
    const persona = agentTpl.persona
      ? agentTpl.persona.replace(/\{\{COMPANY_NAME\}\}/g, companyName)
      : `You are the ${agentTpl.role} at ${companyName}. ${companyDesc}`;

    const reportsTo = agentTpl.reports_to_role === 'ceo' ? ceoId : null;

    const { data: newAgent, error } = await supabase
      .from('agents')
      .insert({
        company_id: companyId,
        name: agentTpl.name,
        slug: agentTpl.role.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        role: agentTpl.role.toLowerCase(),
        persona,
        model: MODEL_FOR_TIER[agentTpl.model_tier] || 'claude-sonnet-4-6',
        status: 'idle',
        reports_to: reportsTo,
        config: {
          model_tier: agentTpl.model_tier,
          custom_rules: agentTpl.custom_rules,
          installed_skills: agentTpl.installed_skills,
        },
        tokens_used: 0,
        issues_completed: 0,
      })
      .select('id, role')
      .single();

    if (!error && newAgent) {
      agentsCreated++;
      const agent = newAgent as { id: string; role: string };
      if (!leadAgentId && agentTpl.reports_to_role === 'ceo') {
        leadAgentId = agent.id;
      }
    }
  }

  // Link non-CEO reports_to relationships
  if (agentsCreated > 1) {
    const { data: allAgents } = await supabase
      .from('agents').select('id, role').eq('company_id', companyId);
    const roleToId = new Map<string, string>();
    for (const a of (allAgents ?? []) as Array<{ id: string; role: string }>) {
      roleToId.set(a.role.toLowerCase(), a.id);
    }
    for (const agentTpl of template.agents) {
      if (agentTpl.reports_to_role && agentTpl.reports_to_role !== 'ceo') {
        const childId = roleToId.get(agentTpl.role.toLowerCase());
        const parentId = roleToId.get(agentTpl.reports_to_role.toLowerCase());
        if (childId && parentId) {
          await supabase.from('agents').update({ reports_to: parentId }).eq('id', childId);
        }
      }
    }
  }

  // Create routines
  let routinesCreated = 0;
  for (const routineTpl of template.routines) {
    const { error } = await supabase.from('routines').insert({
      company_id: companyId,
      name: routineTpl.name,
      type: routineTpl.type,
      schedule: routineTpl.schedule,
      event_trigger: routineTpl.event_trigger,
      issue_template: routineTpl.issue_template,
      enabled: true,
    });
    if (!error) routinesCreated++;
  }

  // Create kickoff issue
  let kickoffIssueId: string | null = null;
  if (leadAgentId) {
    const teamLabel = teamType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const { data: kickoff } = await supabase
      .from('issues')
      .insert({
        company_id: companyId,
        title: `${teamLabel} — Initial Setup & Strategy`,
        description: `## Team Deployed: ${teamLabel}\n\nYour team has been automatically deployed. As team lead, your first task:\n\n1. **Analyze the company**: Review ${companyName}'s business and goals\n2. **Create a strategy**: Develop a 30-day plan for your team\n3. **Assign first tasks**: Break your strategy into issues for each team member\n4. **Report to CEO**: Brief the CEO on your plan\n\nCompany: ${companyDesc || 'Research the company first.'}`,
        status: 'open',
        priority: 'high',
        type: 'task',
        assigned_to: leadAgentId,
        metadata: {
          source: 'auto_provisioner',
          team_type: teamType,
          agents_created: agentsCreated,
        },
      })
      .select('id')
      .single();
    if (kickoff) kickoffIssueId = (kickoff as { id: string }).id;
  }

  // Audit log
  await supabase.from('audit_log').insert({
    company_id: companyId,
    action: 'team_provisioned',
    details: { team_type: teamType, agents_created: agentsCreated, routines_created: routinesCreated },
  });

  const teamLabel = teamType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return {
    success: true,
    agentsCreated,
    routinesCreated,
    leadAgentId,
    kickoffIssueId,
    message: `${teamLabel} deployed — ${agentsCreated} agents ready. Your team lead is already planning.`,
  };
}

// ---------------------------------------------------------------------------
// POST /api/apex/command
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Step 1: Authenticate
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: Parse & validate
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateCommandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { command, company_id } = parsed.data;

  // Step 3: Verify ownership
  const authorized = await requireOwnership(user.id, company_id);
  if (!authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = getSupabaseServiceRole();

  // Step 4: Classify the command
  const intent = await classifyCommand(command);

  // Step 5: Route based on intent
  if (intent.type === 'BUILD_TEAM' && intent.team_type && intent.confidence >= 80) {
    // ----- AUTO-PROVISION PATH -----
    const result = await provisionTeamInline(company_id, intent.team_type, supabase);

    if (result.success) {
      return NextResponse.json({
        intent,
        provisioned: true,
        result: {
          agents_created: result.agentsCreated,
          routines_created: result.routinesCreated,
          lead_agent_id: result.leadAgentId,
          kickoff_issue_id: result.kickoffIssueId,
          message: result.message,
        },
      }, { status: 201 });
    }

    // Provisioning failed — fall through to CEO routing
    // (e.g., duplicate team, custom team type, etc.)
  }

  // ----- CEO ROUTING PATH (default) -----
  // Find CEO agent (case-insensitive — fix the bug)
  const { data: ceoAgent, error: agentError } = await supabase
    .from('agents')
    .select('*')
    .eq('company_id', company_id)
    .ilike('role', 'ceo')
    .maybeSingle();

  if (agentError) {
    return NextResponse.json(
      { error: `Database error: ${agentError.message}` },
      { status: 500 },
    );
  }

  if (!ceoAgent) {
    return NextResponse.json(
      { error: 'No CEO agent found. Please complete onboarding first.' },
      { status: 400 },
    );
  }

  // Create issue for CEO (priority as TEXT — matches live schema)
  const now = new Date().toISOString();
  const { data: issue, error: issueError } = await supabase
    .from('issues')
    .insert({
      company_id,
      title: extractTitle(command),
      description: buildDescription(command, intent),
      status: 'open',
      priority: 'critical',
      type: 'task',
      assigned_to: ceoAgent.id,
      metadata: {
        source: 'command_bar',
        original_command: command,
        intent_type: intent.type,
        intent_confidence: intent.confidence,
        timestamp: now,
      },
    })
    .select('*')
    .single();

  if (issueError) {
    return NextResponse.json(
      { error: `Failed to create issue: ${issueError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    intent,
    provisioned: false,
    issue,
  }, { status: 201 });
}
