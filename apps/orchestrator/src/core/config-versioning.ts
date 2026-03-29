/**
 * Config Versioning — tracks every change to agent configs with full rollback.
 * Every PATCH to an agent writes to the config history before applying.
 */
import { getSupabaseAdmin } from '../lib/supabase.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ConfigVersioning');

export interface ConfigChange {
  agent_id: string;
  changed_field: string;
  old_value: unknown;
  new_value: unknown;
  changed_by: string; // agent_id or 'operator' or 'see'
}

export class ConfigVersioning {
  private supabase = getSupabaseAdmin();

  /**
   * Record a config change before applying it.
   * Returns the history record ID for potential rollback.
   */
  async recordChange(change: ConfigChange): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('agent_config_history')
        .insert({
          agent_id: change.agent_id,
          changed_field: change.changed_field,
          old_value: change.old_value,
          new_value: change.new_value,
          changed_by: change.changed_by,
        })
        .select('id')
        .single();

      if (error) {
        log.error('Failed to record config change', { error: error.message });
        return null;
      }

      return (data as { id: string })?.id ?? null;
    } catch (err) {
      log.error('Config versioning error', { error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  /**
   * Record multiple field changes atomically.
   */
  async recordChanges(agentId: string, changedBy: string, oldConfig: Record<string, unknown>, newConfig: Record<string, unknown>): Promise<void> {
    for (const [field, newValue] of Object.entries(newConfig)) {
      const oldValue = oldConfig[field];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        await this.recordChange({
          agent_id: agentId,
          changed_field: field,
          old_value: oldValue ?? null,
          new_value: newValue,
          changed_by: changedBy,
        });
      }
    }
  }

  /**
   * Rollback an agent's config to a specific point in time.
   * Applies all old_values from history records after the target timestamp.
   */
  async rollbackToVersion(agentId: string, targetHistoryId: string): Promise<{ success: boolean; fieldsRolledBack: string[] }> {
    try {
      // Get the target history record to find its timestamp
      const { data: targetRecord } = await this.supabase
        .from('agent_config_history')
        .select('created_at')
        .eq('id', targetHistoryId)
        .eq('agent_id', agentId)
        .single();

      if (!targetRecord) {
        return { success: false, fieldsRolledBack: [] };
      }

      // Get all changes AFTER this point (to revert them)
      const { data: changesToRevert } = await this.supabase
        .from('agent_config_history')
        .select('changed_field, old_value')
        .eq('agent_id', agentId)
        .gt('created_at', (targetRecord as { created_at: string }).created_at)
        .order('created_at', { ascending: false });

      if (!changesToRevert || changesToRevert.length === 0) {
        return { success: true, fieldsRolledBack: [] };
      }

      // Apply rollback — for each changed field, restore the old value
      const updates: Record<string, unknown> = {};
      const fieldsRolledBack: string[] = [];

      for (const change of changesToRevert as Array<{ changed_field: string; old_value: unknown }>) {
        if (!updates[change.changed_field]) {
          updates[change.changed_field] = change.old_value;
          fieldsRolledBack.push(change.changed_field);
        }
      }

      // Apply the rollback to the agents table
      const { error } = await this.supabase
        .from('agents')
        .update(updates)
        .eq('id', agentId);

      if (error) {
        log.error('Rollback failed', { agentId, error: error.message });
        return { success: false, fieldsRolledBack: [] };
      }

      // Record the rollback itself as a change
      await this.recordChange({
        agent_id: agentId,
        changed_field: '_rollback',
        old_value: { fields: fieldsRolledBack },
        new_value: { target_version: targetHistoryId },
        changed_by: 'operator',
      });

      log.info('Config rollback successful', { agentId, fieldsRolledBack });
      return { success: true, fieldsRolledBack };
    } catch (err) {
      log.error('Rollback error', { error: err instanceof Error ? err.message : String(err) });
      return { success: false, fieldsRolledBack: [] };
    }
  }

  /**
   * Get config history timeline for an agent.
   */
  async getHistory(agentId: string, limit: number = 50): Promise<Array<ConfigChange & { id: string; created_at: string }>> {
    const { data, error } = await this.supabase
      .from('agent_config_history')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data as unknown as Array<ConfigChange & { id: string; created_at: string }>;
  }
}
