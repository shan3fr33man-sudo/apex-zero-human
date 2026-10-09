import { NextResponse } from 'next/server';
import { getSupabaseServiceRole, getAuthenticatedUser } from '@/lib/supabase-server';

/**
 * POST /api/auth/onboard
 *
 * Smart Onboarding — Creates company, CEO agent, and optionally auto-deploys
 * a team based on the business description using the Command Classifier.
 *
 * Body: { companyName: string, goal: string, teamType?: string }
 *
 * Flow:
 * 1. Create org (if needed) + company + CEO agent
 * 2. If teamType is specified → auto-provision that team
 * 3. If not → classify the goal to suggest a team, but don't auto-deploy
 * 4. Create initial "analyze and plan" issue for CEO
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { companyName, goal, teamType } = await request.json();

    if (!companyName) {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServiceRole();

    // 1. Find the user record
    const { data: userRecord, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single();

    if (userError || !userRecord) {
      console.error('[onboard] User lookup error:', userError?.message);
      return NextResponse.json(
        { error: 'User record not found. Please try signing up again.' },
        { status: 404 },
      );
    }

    // 2. Find or create organization
    let orgId: string;
    const { data: membership, error: memberError } = await supabase
      .from('memberships')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (memberError || !membership) {
      console.log('[onboard] No membership found, creating org');

      const email = user.email || 'user';
      const orgSlug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-org';

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: `${email.split('@')[0]}'s Organization`,
          slug: `${orgSlug}-${Date.now()}`,
        })
        .select('id')
        .single();

      if (orgError || !org) {
        console.error('[onboard] Org creation error:', orgError?.message);
        return NextResponse.json(
          { error: 'Failed to create organization' },
          { status: 500 },
        );
      }

      await supabase.from('memberships').insert({
        user_id: user.id,
        org_id: org.id,
        role: 'owner',
      });

      orgId = org.id;
    } else {
      orgId = membership.org_id;
    }

    // 3. Create the company
    const slug = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        org_id: orgId,
        name: companyName,
        slug: slug || `company-${Date.now()}`,
        description: goal || null,
        status: 'active',
        token_budget: 1000000,
      })
      .select()
      .single();

    if (companyError) {
      console.error('[onboard] Company creation error:', companyError.message);
      return NextResponse.json(
        { error: companyError.message },
        { status: 400 },
      );
    }

    // 4. Auto-spawn CEO agent
    const ceoPersona = goal
      ? `You are the CEO of ${companyName}. Your mission: ${goal}. You are autonomous — make decisions, delegate work, and build your team to execute this mission.`
      : `You are the CEO of ${companyName}. Run this company autonomously. Make decisions, delegate work, and build your team.`;

    const { data: ceoAgent, error: agentError } = await supabase
      .from('agents')
      .insert({
        company_id: company.id,
        name: 'CEO',
        slug: 'ceo',
        role: 'ceo',
        model: 'claude-sonnet-4-6',
        status: 'idle',
        persona: ceoPersona,
        tokens_used: 0,
        issues_completed: 0,
      })
      .select('id')
      .single();

    if (agentError) {
      console.error('[onboard] Agent creation error:', agentError.message);
    }

    const ceoId = (ceoAgent as { id: string } | null)?.id || null;

    // 5. Auto-provision team if teamType specified
    let provisionResult: {
      agentsCreated: number;
      teamType: string;
      message: string;
    } | null = null;

    if (teamType && teamType !== 'custom') {
      try {
        // Inline provisioning (same as command route)
        const fs = await import('fs');
        const path = await import('path');

        const candidates = [
          path.join(process.cwd(), 'templates', teamType, 'template.json'),
          path.join(process.cwd(), '..', '..', 'templates', teamType, 'template.json'),
          `/root/apex-zero-human/templates/${teamType}/template.json`,
        ];

        let raw: string | null = null;
        for (const p of candidates) {
          try { raw = fs.readFileSync(p, 'utf-8'); break; } catch { continue; }
        }

        if (raw) {
          const template = JSON.parse(raw);
          const MODEL_FOR_TIER: Record<string, string> = {
            STRATEGIC: 'claude-sonnet-4-6',
            TECHNICAL: 'claude-sonnet-4-6',
            ROUTINE: 'claude-haiku-4-5-20251001',
          };

          let agentsCreated = 0;
          let leadAgentId: string | null = null;

          for (const agentTpl of template.agents) {
            const persona = agentTpl.persona
              ? agentTpl.persona.replace(/\{\{COMPANY_NAME\}\}/g, companyName)
              : `You are the ${agentTpl.role} at ${companyName}.`;

            const reportsTo = agentTpl.reports_to_role === 'ceo' ? ceoId : null;

            const { data: newAgent, error } = await supabase
              .from('agents')
              .insert({
                company_id: company.id,
                name: agentTpl.name,
                slug: agentTpl.role.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                role: agentTpl.role.toLowerCase(),
                persona,
                model: MODEL_FOR_TIER[agentTpl.model_tier] || 'claude-sonnet-4-6',
                status: 'idle',
                reports_to: reportsTo,
                config: {
                  model_tier: agentTpl.model_tier,
                  custom_rules: agentTpl.custom_rules || [],
                  installed_skills: agentTpl.installed_skills || [],
                },
                tokens_used: 0,
                issues_completed: 0,
              })
              .select('id, role')
              .single();

            if (!error && newAgent) {
              agentsCreated++;
              if (!leadAgentId && agentTpl.reports_to_role === 'ceo') {
                leadAgentId = (newAgent as { id: string }).id;
              }
            }
          }

          // Create routines
          for (const routineTpl of template.routines || []) {
            await supabase.from('routines').insert({
              company_id: company.id,
              name: routineTpl.name,
              type: routineTpl.type,
              schedule: routineTpl.schedule,
              event_trigger: routineTpl.event_trigger,
              issue_template: routineTpl.issue_template,
              enabled: true,
            });
          }

          // Kickoff issue for team lead
          if (leadAgentId) {
            const teamLabel = teamType.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
            await supabase.from('issues').insert({
              company_id: company.id,
              title: `${teamLabel} — Initial Setup & Strategy`,
              description: `Your team has been deployed for ${companyName}. Create a 30-day strategy, assign first tasks to your team members, and report your plan to the CEO.\n\nCompany goal: ${goal || 'Not specified — research the company first.'}`,
              status: 'open',
              priority: 'high',
              type: 'task',
              assigned_to: leadAgentId,
              metadata: { source: 'onboard_provision', team_type: teamType },
            });
          }

          provisionResult = {
            agentsCreated,
            teamType,
            message: `${teamType.replace(/-/g, ' ')} deployed with ${agentsCreated} agents`,
          };

          // Audit log
          await supabase.from('audit_log').insert({
            company_id: company.id,
            action: 'team_provisioned',
            details: { team_type: teamType, agents_created: agentsCreated, source: 'onboard' },
          });
        }
      } catch (err) {
        console.error('[onboard] Team provisioning error:', err);
        // Non-fatal — company and CEO still created
      }
    }

    // 6. Create initial CEO issue regardless of team provisioning
    if (ceoId) {
      await supabase.from('issues').insert({
        company_id: company.id,
        title: `Analyze ${companyName} and create initial roadmap`,
        description: `## Welcome to APEX

You are the CEO of ${companyName}. Your first task:

1. **Understand the business**: ${goal || 'Research what this company does'}
2. **Create a roadmap**: Break the company goal into actionable milestones
3. **Assess your team**: Review which agents are available and what they can do
4. **Assign first tasks**: Create issues for your team members
5. **Set priorities**: Ensure the highest-impact work happens first

${provisionResult ? `\nA ${provisionResult.teamType.replace(/-/g, ' ')} has been deployed. Coordinate with your team lead.` : 'You are currently the only agent. Request hiring if you need a team.'}

Start immediately. Be decisive.`,
        status: 'open',
        priority: 'critical',
        type: 'task',
        assigned_to: ceoId,
        metadata: { source: 'onboard', has_team: !!provisionResult },
      });
    }

    return NextResponse.json({
      company: { id: company.id, name: company.name, slug: company.slug },
      ceo_agent_id: ceoId,
      team_provisioned: provisionResult,
    });
  } catch (err) {
    console.error('[onboard] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
