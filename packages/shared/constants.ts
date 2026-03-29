export const APEX_CONSTANTS = {
  // Heartbeat states — must execute in this exact order
  HEARTBEAT_STATES: [
    'IDENTITY_CONFIRMED',
    'MEMORY_LOADED',
    'PLAN_READ',
    'RESEARCH_COMPLETE',
    'ASSIGNMENT_CLAIMED',
    'EXECUTING',
    'HANDOFF_COMPLETE',
  ] as const,

  // Model tiers
  MODEL_TIERS: {
    STRATEGIC: 'STRATEGIC',
    TECHNICAL: 'TECHNICAL',
    ROUTINE: 'ROUTINE',
  } as const,

  // Issue statuses
  ISSUE_STATUSES: [
    'open',
    'in_progress',
    'in_review',
    'completed',
    'blocked',
    'human_review_required',
  ] as const,

  // Agent statuses
  AGENT_STATUSES: [
    'idle',
    'working',
    'paused',
    'stalled',
    'terminated',
  ] as const,

  // Inbox item types
  INBOX_ITEM_TYPES: [
    'HIRE_APPROVAL',
    'BUDGET_ALERT',
    'STALL_ALERT',
    'PERSONA_PATCH',
    'IRREVERSIBLE_ACTION',
    'HUMAN_REVIEW_REQUIRED',
    'SYSTEM_ALERT',
  ] as const,

  // Routine types
  ROUTINE_TYPES: ['SCHEDULED', 'REACTIVE'] as const,

  // Memory types
  MEMORY_TYPES: ['identity', 'plan', 'learning', 'rule', 'context'] as const,

  // Timers (ms)
  ORCHESTRATOR_TICK_MS: 5000,
  AUTOSCALER_TICK_MS: 30000,
  STALL_CHECK_MS: 300000,

  // Design system colors
  COLORS: {
    BG: '#0A0A0A',
    SURFACE: '#111111',
    BORDER: '#1F1F1F',
    TEXT: '#F5F5F5',
    MUTED: '#6B6B6B',
    ACCENT: '#00FF88',
    WARNING: '#FFB800',
    DANGER: '#FF4444',
    INFO: '#3B82F6',
  },
} as const;

export type HeartbeatState = (typeof APEX_CONSTANTS.HEARTBEAT_STATES)[number];
export type ModelTier = keyof typeof APEX_CONSTANTS.MODEL_TIERS;
export type IssueStatus = (typeof APEX_CONSTANTS.ISSUE_STATUSES)[number];
export type AgentStatus = (typeof APEX_CONSTANTS.AGENT_STATUSES)[number];
export type InboxItemType = (typeof APEX_CONSTANTS.INBOX_ITEM_TYPES)[number];
export type RoutineType = (typeof APEX_CONSTANTS.ROUTINE_TYPES)[number];
export type MemoryType = (typeof APEX_CONSTANTS.MEMORY_TYPES)[number];
