/**
 * Command Classifier — The Brain of Godmode
 *
 * Classifies plain English commands into structured intents using a single
 * Claude Haiku call. Runs BEFORE the CEO agent sees anything.
 *
 * This is NOT an agent — it's a utility function. Fast, cheap, deterministic.
 *
 * Examples:
 *   "act as my marketing team" → BUILD_TEAM, marketing
 *   "write a blog post about AI" → EXECUTE_TASK, content creation
 *   "how many leads came in today" → QUERY, metrics
 *   "set up weekly email reports" → CONFIGURE, routines
 */
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../lib/logger.js';

const log = createLogger('CommandClassifier');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandIntentType =
  | 'BUILD_TEAM'      // "act as my marketing team"
  | 'EXECUTE_TASK'    // "write a blog post", "run a facebook ad"
  | 'CONFIGURE'       // "set up weekly reports", "change my budget"
  | 'QUERY'           // "how many leads", "show me revenue"
  | 'UNKNOWN';        // gibberish or unclassifiable

export interface CommandIntent {
  type: CommandIntentType;
  team_type: string | null;       // marketing, sales, support, ops, dev, finance, hr, custom
  specific_task: string | null;   // cleaned description of what to do
  confidence: number;             // 0-100
  requires_new_agents: boolean;
  estimated_complexity: 'simple' | 'moderate' | 'complex';
  suggested_roles: string[];      // which agent roles should handle this
}

// ---------------------------------------------------------------------------
// Team type synonyms → canonical template names
// ---------------------------------------------------------------------------

const TEAM_SYNONYMS: Record<string, string> = {
  // Marketing
  'marketing': 'marketing-team',
  'marketing team': 'marketing-team',
  'marketing department': 'marketing-team',
  'content team': 'marketing-team',
  'content marketing': 'marketing-team',
  'social media': 'marketing-team',
  'social media team': 'marketing-team',
  'brand team': 'marketing-team',
  'growth team': 'marketing-team',
  'growth': 'marketing-team',

  // Sales
  'sales': 'sales-team',
  'sales team': 'sales-team',
  'sales department': 'sales-team',
  'business development': 'sales-team',
  'biz dev': 'sales-team',
  'revenue team': 'sales-team',

  // Support
  'support': 'support-team',
  'support team': 'support-team',
  'customer support': 'support-team',
  'customer service': 'support-team',
  'help desk': 'support-team',
  'service team': 'support-team',
  'customer success': 'support-team',

  // Operations
  'operations': 'operations-team',
  'operations team': 'operations-team',
  'ops': 'operations-team',
  'ops team': 'operations-team',
  'logistics': 'operations-team',
  'process team': 'operations-team',

  // Development
  'dev': 'dev-team',
  'dev team': 'dev-team',
  'development team': 'dev-team',
  'engineering': 'dev-team',
  'engineering team': 'dev-team',
  'tech team': 'dev-team',
  'software team': 'dev-team',
  'product team': 'dev-team',

  // Finance
  'finance': 'finance-team',
  'finance team': 'finance-team',
  'accounting': 'finance-team',
  'accounting team': 'finance-team',
  'bookkeeping': 'finance-team',

  // HR
  'hr': 'hr-team',
  'hr team': 'hr-team',
  'human resources': 'hr-team',
  'recruiting': 'hr-team',
  'recruitment': 'hr-team',
  'people team': 'hr-team',
  'people ops': 'hr-team',

  // Moving (vertical)
  'moving': 'moving-company',
  'moving company': 'moving-company',
  'movers': 'moving-company',

  // Full company
  'full company': 'full-corporation',
  'entire company': 'full-corporation',
  'whole company': 'full-corporation',
  'everything': 'full-corporation',
  'run my company': 'full-corporation',
  'run my business': 'full-corporation',
};

// ---------------------------------------------------------------------------
// Fast local classification (no LLM call needed for obvious cases)
// ---------------------------------------------------------------------------

function tryLocalClassify(command: string): CommandIntent | null {
  const lower = command.toLowerCase().trim();

  // Pattern: "act as my X team" / "be my X team" / "run my X"
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

  // Pattern: direct team name mentions
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

  return null; // Couldn't classify locally — needs LLM
}

// ---------------------------------------------------------------------------
// LLM-based classification (Claude Haiku — fast and cheap)
// ---------------------------------------------------------------------------

const CLASSIFIER_SYSTEM_PROMPT = `You are a command classifier for an AI company platform called APEX. Your job is to analyze a plain English command from a business owner and classify it into a structured intent.

You MUST respond with ONLY valid JSON — no markdown, no explanation, no text before or after the JSON.

The JSON schema:
{
  "type": "BUILD_TEAM" | "EXECUTE_TASK" | "CONFIGURE" | "QUERY" | "UNKNOWN",
  "team_type": string | null,
  "specific_task": string | null,
  "confidence": number (0-100),
  "requires_new_agents": boolean,
  "estimated_complexity": "simple" | "moderate" | "complex",
  "suggested_roles": string[]
}

Rules:
- BUILD_TEAM: User wants to create/deploy a team of agents. team_type must be one of: marketing-team, sales-team, support-team, operations-team, dev-team, finance-team, hr-team, moving-company, full-corporation, or "custom" if none match.
- EXECUTE_TASK: User wants a specific task done (write content, run ads, analyze data, etc.)
- CONFIGURE: User wants to change settings, schedules, or routines
- QUERY: User is asking a question about their business data
- UNKNOWN: Cannot determine intent

For EXECUTE_TASK, suggested_roles should include which agent roles would handle it. Available roles: ceo, engineer, qa, marketing, ux, dispatch, lead_recovery, quote, compliance, fleet_coordinator, review_request, eval_engineer

For BUILD_TEAM, suggested_roles should always be ["ceo"] since the CEO oversees team creation.

confidence should reflect how certain you are about the classification. If the command is ambiguous, use 50-70.`;

async function llmClassify(
  command: string,
  apiKey?: string,
): Promise<CommandIntent> {
  const client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      temperature: 0,
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: command }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Parse the JSON response
    const parsed = JSON.parse(text) as CommandIntent;

    // Validate required fields
    if (!parsed.type || typeof parsed.confidence !== 'number') {
      throw new Error('Invalid classifier response structure');
    }

    // Normalize team_type to match template names
    if (parsed.type === 'BUILD_TEAM' && parsed.team_type) {
      const normalized = TEAM_SYNONYMS[parsed.team_type.toLowerCase()] || parsed.team_type;
      parsed.team_type = normalized;
    }

    log.info('LLM classification complete', {
      command: command.substring(0, 50),
      type: parsed.type,
      confidence: parsed.confidence,
    });

    return parsed;
  } catch (err) {
    log.error('LLM classification failed, falling back to CEO routing', {
      error: err instanceof Error ? err.message : String(err),
    });

    // Fallback: send everything to CEO as EXECUTE_TASK
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a plain English command into a structured intent.
 * Tries fast local pattern matching first, falls back to LLM if needed.
 *
 * @param command - The raw command from the user
 * @param apiKey - Optional BYOK API key for the LLM call
 * @returns Structured CommandIntent
 */
export async function classifyCommand(
  command: string,
  apiKey?: string,
): Promise<CommandIntent> {
  // Step 1: Try fast local classification (no LLM, instant)
  const localResult = tryLocalClassify(command);
  if (localResult) {
    log.info('Local classification hit', {
      command: command.substring(0, 50),
      type: localResult.type,
      team_type: localResult.team_type,
    });
    return localResult;
  }

  // Step 2: Fall back to LLM classification
  return llmClassify(command, apiKey);
}

/**
 * Check if a team template exists for the given team type.
 */
export function isKnownTeamTemplate(teamType: string): boolean {
  const knownTemplates = [
    'marketing-team',
    'sales-team',
    'support-team',
    'operations-team',
    'dev-team',
    'finance-team',
    'hr-team',
    'moving-company',
    'full-corporation',
  ];
  return knownTemplates.includes(teamType);
}

/**
 * Get the list of all available team template names.
 */
export function getAvailableTemplates(): string[] {
  return [
    'marketing-team',
    'sales-team',
    'support-team',
    'operations-team',
    'dev-team',
    'finance-team',
    'hr-team',
    'moving-company',
    'full-corporation',
  ];
}
