/**
 * Module 7: Smart Model Router + Fallback Chain
 *
 * Routes LLM calls to the appropriate model based on agent tier:
 *   STRATEGIC → claude-sonnet-4-6 (CEO, Eval Engineer)
 *   TECHNICAL → claude-sonnet-4-5 (Engineer, QA, UX, Dispatch)
 *   ROUTINE   → claude-haiku-4-5 (Content, Fleet, Review Requester)
 *
 * Implements retry with exponential backoff and automatic fallback
 * to the next model tier if the primary model is unavailable.
 *
 * Token estimation uses conservative char-to-token ratio (~3.5 chars/token).
 */
import Anthropic from '@anthropic-ai/sdk';
import { TokenGateway, type TokenUsage } from '../core/token-gateway.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ModelRouter');

export type ModelTier = 'STRATEGIC' | 'TECHNICAL' | 'ROUTINE';

interface ModelConfig {
  primary: string;
  fallback: string;
  costPerInputToken: number;
  costPerOutputToken: number;
}

const MODEL_ROUTING: Record<ModelTier, ModelConfig> = {
  STRATEGIC: {
    primary: 'claude-sonnet-4-6',
    fallback: 'claude-sonnet-4-5-20241022',
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
  },
  TECHNICAL: {
    primary: 'claude-sonnet-4-5-20241022',
    fallback: 'claude-haiku-4-5-20251001',
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
  },
  ROUTINE: {
    primary: 'claude-haiku-4-5-20251001',
    fallback: 'claude-haiku-4-5-20251001',
    costPerInputToken: 0.00000025,
    costPerOutputToken: 0.00000125,
  },
};

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;

export interface LlmRequest {
  companyId: string;
  agentId: string;
  issueId: string | null;
  tier: ModelTier;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  modelOverride?: string;
}

export interface LlmResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  stopReason: string | null;
}

export class ModelRouter {
  private client: Anthropic;
  private tokenGateway: TokenGateway;

  constructor(tokenGateway: TokenGateway) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('[ModelRouter] Missing ANTHROPIC_API_KEY');
    }
    this.client = new Anthropic({ apiKey });
    this.tokenGateway = tokenGateway;
  }

  /**
   * Get the model name for a given tier (or override).
   */
  getModel(tier: ModelTier, override?: string): string {
    return override ?? MODEL_ROUTING[tier].primary;
  }

  /**
   * Make an LLM call with budget check, retry, and fallback.
   *
   * 1. Estimate tokens and check budget
   * 2. Try primary model with retries
   * 3. On failure, fall back to secondary model
   * 4. Record actual token usage
   */
  async call(request: LlmRequest): Promise<LlmResponse> {
    const config = MODEL_ROUTING[request.tier];
    const models = request.modelOverride
      ? [request.modelOverride]
      : [config.primary, config.fallback];

    // Estimate tokens for budget check
    const estimatedTokens = this.estimateTokens(
      request.systemPrompt + request.messages.map(m => m.content).join('')
    );

    // Check budget BEFORE making the LLM call
    const budgetCheck = await this.tokenGateway.checkBudget(
      request.companyId,
      estimatedTokens
    );

    if (!budgetCheck.allowed) {
      log.warn('LLM call blocked by budget', {
        companyId: request.companyId,
        agentId: request.agentId,
        estimatedTokens,
        reason: budgetCheck.reason,
      });
      throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
    }

    // Try each model in the fallback chain
    let lastError: Error | null = null;

    for (const model of models) {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const response = await this.callClaude(model, request);

          // Record actual token usage
          const usage: TokenUsage = {
            model: response.model,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            costUsd: response.costUsd,
          };

          await this.tokenGateway.recordUsage(
            request.companyId,
            request.agentId,
            request.issueId,
            usage
          );

          log.info('LLM call succeeded', {
            model: response.model,
            tier: request.tier,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            costUsd: response.costUsd,
            attempt,
          });

          return response;

        } catch (err: unknown) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const status = (err as { status?: number }).status;

          // Don't retry client errors (400, 401, 403)
          if (status === 400 || status === 401 || status === 403) {
            log.error('Client error — not retrying', {
              model,
              status,
              error: lastError.message,
            });
            throw lastError;
          }

          log.warn('LLM call failed, retrying', {
            model,
            attempt,
            maxRetries: MAX_RETRIES,
            error: lastError.message,
          });

          if (attempt < MAX_RETRIES) {
            await this.sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1));
          }
        }
      }

      log.warn('All retries exhausted for model, trying fallback', { model });
    }

    throw new Error(
      `All models failed for tier ${request.tier}: ${lastError?.message ?? 'unknown error'}`
    );
  }

  /**
   * Estimate token count from text length.
   * Conservative estimate: ~3.5 characters per token.
   * Always add a buffer for safety.
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5) + 200; // +200 buffer for overhead
  }

  /**
   * Calculate cost in USD for a given model and token counts.
   */
  calculateCost(tier: ModelTier, inputTokens: number, outputTokens: number): number {
    const config = MODEL_ROUTING[tier];
    return (
      inputTokens * config.costPerInputToken +
      outputTokens * config.costPerOutputToken
    );
  }

  /**
   * Make the actual Claude API call.
   */
  private async callClaude(model: string, request: LlmRequest): Promise<LlmResponse> {
    const response = await this.client.messages.create({
      model,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.7,
      system: request.systemPrompt,
      messages: request.messages,
    });

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    // Determine tier for cost calculation
    let tier: ModelTier = 'ROUTINE';
    for (const [t, config] of Object.entries(MODEL_ROUTING)) {
      if (config.primary === model || config.fallback === model) {
        tier = t as ModelTier;
        break;
      }
    }

    return {
      content,
      model: response.model,
      inputTokens,
      outputTokens,
      costUsd: this.calculateCost(tier, inputTokens, outputTokens),
      stopReason: response.stop_reason,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
