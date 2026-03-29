/**
 * APEX Plugin System — lifecycle hooks for extending the orchestrator.
 */

export interface ApexPluginContext {
  companyId: string;
  supabaseUrl: string;
}

export interface ApexPlugin {
  readonly name: string;
  readonly version: string;

  /** Called once when the plugin is loaded */
  initialize(ctx: ApexPluginContext): Promise<void>;

  /** Called when an agent starts executing an issue */
  onAgentStart?(agentId: string, agentRole: string, issueId: string): Promise<void>;

  /** Called when an agent completes an issue */
  onAgentComplete?(agentId: string, agentRole: string, issueId: string, result: { success: boolean; tokensUsed: number; qualityScore: number }): Promise<void>;

  /** Called when a new issue is created */
  onIssueCreated?(issueId: string, title: string, assignedRole: string | null): Promise<void>;

  /** Called when an event is received by the event bus */
  onEventReceived?(eventType: string, payload: Record<string, unknown>): Promise<void>;

  /** Called when the plugin is being shut down */
  shutdown?(): Promise<void>;
}
