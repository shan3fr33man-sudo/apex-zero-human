/**
 * Plugin Loader — discovers, initializes, and fires lifecycle hooks.
 * Reads the plugins directory, initializes each plugin, and dispatches events.
 */
import { createLogger } from '../lib/logger.js';
import type { ApexPlugin, ApexPluginContext } from './types.js';
import { KnowledgeBasePlugin } from './knowledge-base.js';
import { CustomTracingPlugin } from './custom-tracing.js';
import { QueueManagerPlugin } from './queue-manager.js';

const log = createLogger('PluginLoader');

export class PluginLoader {
  private plugins: ApexPlugin[] = [];
  private initialized = false;

  /**
   * Initialize all built-in plugins.
   * External plugins would be loaded from the filesystem here.
   */
  async initialize(ctx: ApexPluginContext): Promise<void> {
    if (this.initialized) return;

    const builtins: ApexPlugin[] = [
      new KnowledgeBasePlugin(),
      new CustomTracingPlugin(),
      new QueueManagerPlugin(),
    ];

    for (const plugin of builtins) {
      try {
        await plugin.initialize(ctx);
        this.plugins.push(plugin);
        log.info('Plugin loaded', { name: plugin.name, version: plugin.version });
      } catch (err) {
        log.error('Failed to initialize plugin', {
          name: plugin.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.initialized = true;
    log.info('Plugin loader initialized', { pluginCount: this.plugins.length });
  }

  /**
   * Fire onAgentStart for all plugins.
   */
  async fireAgentStart(agentId: string, agentRole: string, issueId: string): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.onAgentStart?.(agentId, agentRole, issueId);
      } catch (err) {
        log.warn('Plugin onAgentStart error', {
          plugin: plugin.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Fire onAgentComplete for all plugins.
   */
  async fireAgentComplete(
    agentId: string,
    agentRole: string,
    issueId: string,
    result: { success: boolean; tokensUsed: number; qualityScore: number }
  ): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.onAgentComplete?.(agentId, agentRole, issueId, result);
      } catch (err) {
        log.warn('Plugin onAgentComplete error', {
          plugin: plugin.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Fire onIssueCreated for all plugins.
   */
  async fireIssueCreated(issueId: string, title: string, assignedRole: string | null): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.onIssueCreated?.(issueId, title, assignedRole);
      } catch (err) {
        log.warn('Plugin onIssueCreated error', {
          plugin: plugin.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Fire onEventReceived for all plugins.
   */
  async fireEventReceived(eventType: string, payload: Record<string, unknown>): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.onEventReceived?.(eventType, payload);
      } catch (err) {
        log.warn('Plugin onEventReceived error', {
          plugin: plugin.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Get list of loaded plugins.
   */
  getLoadedPlugins(): Array<{ name: string; version: string }> {
    return this.plugins.map(p => ({ name: p.name, version: p.version }));
  }

  /**
   * Shutdown all plugins gracefully.
   */
  async shutdown(): Promise<void> {
    for (const plugin of this.plugins) {
      try {
        await plugin.shutdown?.();
      } catch (err) {
        log.warn('Plugin shutdown error', {
          plugin: plugin.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    this.plugins = [];
    this.initialized = false;
  }
}
