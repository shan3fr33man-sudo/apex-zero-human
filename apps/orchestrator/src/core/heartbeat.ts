/**
 * Module 2: Heartbeat State Machine
 *
 * Every agent must progress through these states in exact order — no skipping:
 *   IDENTITY_CONFIRMED → MEMORY_LOADED → PLAN_READ →
 *   RESEARCH_COMPLETE → ASSIGNMENT_CLAIMED → EXECUTING → HANDOFF_COMPLETE
 *
 * This is server-enforced. The heartbeat table records every state transition
 * with timestamps for monitoring and stall detection.
 */
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('Heartbeat');

export type HeartbeatState =
  | 'IDENTITY_CONFIRMED'
  | 'MEMORY_LOADED'
  | 'PLAN_READ'
  | 'RESEARCH_COMPLETE'
  | 'ASSIGNMENT_CLAIMED'
  | 'EXECUTING'
  | 'HANDOFF_COMPLETE'
  | 'FAILED';

const STATE_ORDER: HeartbeatState[] = [
  'IDENTITY_CONFIRMED',
  'MEMORY_LOADED',
  'PLAN_READ',
  'RESEARCH_COMPLETE',
  'ASSIGNMENT_CLAIMED',
  'EXECUTING',
  'HANDOFF_COMPLETE',
];

export class HeartbeatStateMachine {
  private supabase = getSupabaseAdmin();

  /**
   * Advance to the next state. Enforces strict sequential ordering.
   * Throws if the transition is invalid (e.g., skipping a state).
   */
  async advance(agentId: string, issueId: string, toState: HeartbeatState): Promise<void> {
    if (toState === 'FAILED') {
      throw new Error('Use fail() method for FAILED state transitions');
    }

    const current = await this.getCurrentState(agentId, issueId);
    const currentIdx = current ? STATE_ORDER.indexOf(current) : -1;
    const nextIdx = STATE_ORDER.indexOf(toState);

    // Enforce sequential state progression
    if (nextIdx !== currentIdx + 1) {
      const expected = currentIdx + 1 < STATE_ORDER.length
        ? STATE_ORDER[currentIdx + 1]
        : 'none (already complete)';

      const msg = `Invalid state transition: ${current ?? 'NONE'} → ${toState}. Expected: ${expected}`;
      log.error(msg, { agentId, issueId });
      throw new Error(msg);
    }

    const now = new Date().toISOString();

    // Complete the previous heartbeat entry if it exists
    if (current) {
      await this.supabase
        .from('agent_heartbeats')
        .update({ completed_at: now })
        .eq('agent_id', agentId)
        .eq('issue_id', issueId)
        .eq('state', current)
        .is('completed_at', null);
    }

    // Insert the new state
    const { error } = await this.supabase.from('agent_heartbeats').insert({
      agent_id: agentId,
      issue_id: issueId,
      state: toState,
      started_at: now,
    });

    if (error) {
      log.error('Failed to insert heartbeat', { agentId, issueId, state: toState, error: error.message });
      throw new Error(`Heartbeat insert failed: ${error.message}`);
    }

    log.info('State advanced', { agentId, issueId, from: current ?? 'NONE', to: toState });
  }

  /**
   * Record a failure at any point in the heartbeat cycle.
   */
  async fail(agentId: string, issueId: string, reason: string): Promise<void> {
    const now = new Date().toISOString();

    // Complete any open heartbeat entry
    const current = await this.getCurrentState(agentId, issueId);
    if (current && current !== 'FAILED') {
      await this.supabase
        .from('agent_heartbeats')
        .update({ completed_at: now })
        .eq('agent_id', agentId)
        .eq('issue_id', issueId)
        .eq('state', current)
        .is('completed_at', null);
    }

    const { error } = await this.supabase.from('agent_heartbeats').insert({
      agent_id: agentId,
      issue_id: issueId,
      state: 'FAILED',
      error_message: reason,
      started_at: now,
      completed_at: now,
    });

    if (error) {
      log.error('Failed to record heartbeat failure', { agentId, issueId, error: error.message });
    }

    log.warn('Agent heartbeat failed', { agentId, issueId, reason });
  }

  /**
   * Get the current (most recent) heartbeat state for an agent-issue pair.
   */
  async getCurrentState(agentId: string, issueId: string): Promise<HeartbeatState | null> {
    const { data } = await this.supabase
      .from('agent_heartbeats')
      .select('state')
      .eq('agent_id', agentId)
      .eq('issue_id', issueId)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    return (data?.state as HeartbeatState) ?? null;
  }

  /**
   * Get full heartbeat history for an agent-issue pair (for debugging/audit).
   */
  async getHistory(agentId: string, issueId: string) {
    const { data } = await this.supabase
      .from('agent_heartbeats')
      .select('*')
      .eq('agent_id', agentId)
      .eq('issue_id', issueId)
      .order('started_at', { ascending: true });

    return data ?? [];
  }

  /**
   * Check if an agent has completed all heartbeat states for an issue.
   */
  async isComplete(agentId: string, issueId: string): Promise<boolean> {
    const current = await this.getCurrentState(agentId, issueId);
    return current === 'HANDOFF_COMPLETE';
  }

  /**
   * Get the duration an agent has been in its current state (for stall detection).
   */
  async getCurrentStateDuration(agentId: string, issueId: string): Promise<number | null> {
    const { data } = await this.supabase
      .from('agent_heartbeats')
      .select('started_at')
      .eq('agent_id', agentId)
      .eq('issue_id', issueId)
      .is('completed_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .single();

    if (!data) return null;
    return Date.now() - new Date(data.started_at).getTime();
  }
}
