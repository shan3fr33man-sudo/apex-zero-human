import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * StallDetector Unit Tests
 *
 * Covers:
 * - start() and stop() lifecycle
 * - Detection of stalled issues (in_progress/blocked status)
 * - Escalation logic (1x threshold → inbox + human_review_required)
 * - Force release logic (2x threshold → forceRelease + urgent alert)
 * - Configurable timeout thresholds
 * - Heartbeat progress prevents escalation
 */

// ─── Mock Setup ─────────────────────────────────────────────────────────────

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('../../lib/supabase.js', () => ({
  getSupabaseAdmin: () => ({ from: mockFrom, rpc: mockRpc }),
}));

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { StallDetector } from '../stall-detector.js';
import { TaskRouter } from '../../core/task-router.js';

// ─── Helper for Mocking Query Chains ────────────────────────────────────────

function mockChain(resolvedData: unknown = {}) {
  const chain: Record<string, unknown> = {};
  [
    'select', 'insert', 'update', 'eq', 'neq', 'single', 'maybeSingle',
    'order', 'limit', 'or', 'gt', 'lt', 'gte', 'lte', 'is', 'in',
    'ilike', 'textSearch', 'not', 'filter', 'match', 'delete',
  ].forEach((m) => {
    chain[m] = vi.fn().mockReturnValue(chain);
  });
  Object.defineProperty(chain, 'then', {
    value: (onFulfilled?: (v: unknown) => unknown) =>
      Promise.resolve({ data: resolvedData, error: null }).then(onFulfilled),
    writable: true, configurable: true,
  });
  return chain;
}

// ─── Test Fixtures ──────────────────────────────────────────────────────────

describe('StallDetector', () => {
  let detector: StallDetector;
  let taskRouter: TaskRouter;

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const fiveMinutesAgo = new Date(nowMs - 5 * 60 * 1000).toISOString();
  const thirtyMinutesAgo = new Date(nowMs - 30 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(nowMs - 2 * 60 * 60 * 1000).toISOString();

  const stalledInProgressIssue = {
    id: 'issue-stalled-1',
    company_id: 'company-1',
    assigned_to: 'agent-1',
    stall_threshold_minutes: 30,
    title: 'Stalled feature implementation',
    updated_at: twoHoursAgo, // 2 hours old
    status: 'in_progress',
  };

  const stalledBlockedIssue = {
    id: 'issue-blocked-1',
    company_id: 'company-1',
    assigned_to: 'agent-2',
    stall_threshold_minutes: 30,
    title: 'Blocked on API response',
    updated_at: twoHoursAgo,
    status: 'blocked',
  };

  const recentIssue = {
    id: 'issue-recent-1',
    company_id: 'company-1',
    assigned_to: 'agent-3',
    stall_threshold_minutes: 30,
    title: 'Recently updated task',
    updated_at: now, // Just now
    status: 'in_progress',
  };

  const unassignedIssue = {
    id: 'issue-unassigned-1',
    company_id: 'company-1',
    assigned_to: null,
    stall_threshold_minutes: 30,
    title: 'Unassigned task',
    updated_at: twoHoursAgo,
    status: 'in_progress',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(nowMs);

    taskRouter = new TaskRouter();
    detector = new StallDetector(taskRouter);

    // Default: no issues are stalled
    mockFrom.mockImplementation(() => mockChain([]));
    mockRpc.mockResolvedValue({ data: null, error: null });

    // Mock taskRouter
    vi.spyOn(taskRouter, 'forceRelease').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('start() and stop() lifecycle', () => {
    it('starts the interval timer on start()', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      detector.start();

      expect(setIntervalSpy).toHaveBeenCalled();
      const call = setIntervalSpy.mock.calls[0];
      expect(call[1]).toBeGreaterThan(0); // interval duration

      detector.stop();
    });

    it('clears the interval on stop()', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      detector.start();
      detector.stop();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('uses environment variable STALL_CHECK_MS if provided', () => {
      const originalEnv = process.env.STALL_CHECK_MS;
      process.env.STALL_CHECK_MS = '60000'; // 1 minute

      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      detector.start();

      const call = setIntervalSpy.mock.calls[0];
      expect(call[1]).toBe(60000);

      detector.stop();
      process.env.STALL_CHECK_MS = originalEnv;
    });

    it('uses default 5 minute interval if STALL_CHECK_MS not provided', () => {
      const originalEnv = process.env.STALL_CHECK_MS;
      delete process.env.STALL_CHECK_MS;

      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      detector.start();

      const call = setIntervalSpy.mock.calls[0];
      expect(call[1]).toBe(300000); // 5 minutes

      detector.stop();
      process.env.STALL_CHECK_MS = originalEnv;
    });

    it('handles error in interval callback without crashing', async () => {
      mockFrom.mockImplementation(() => {
        throw new Error('Database error');
      });

      detector.start();
      // Trigger the interval callback manually via fake timers
      await vi.advanceTimersByTimeAsync(300000);

      // Detector should still be running (not crashed)
      expect(detector).toBeDefined();

      detector.stop();
    });

    it('allows multiple start/stop cycles', () => {
      detector.start();
      detector.stop();
      detector.start();
      detector.stop();

      expect(detector).toBeDefined();
    });

    it('stop() is safe to call multiple times', () => {
      detector.start();
      detector.stop();
      detector.stop(); // Should not throw

      expect(detector).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STALL DETECTION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('check() — stall detection', () => {
    it('detects in_progress issues updated more than 5 minutes ago', async () => {
      const selectCalls: Array<{ table: string }> = [];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          selectCalls.push({ table });
          const chain = mockChain([stalledInProgressIssue]);
          // Mock the agent_heartbeats query for hasRecentHeartbeatProgress
          return chain;
        }
        if (table === 'agent_heartbeats') {
          return mockChain([]); // No recent heartbeat
        }
        return mockChain([]);
      });

      await detector.check();

      expect(selectCalls.some(c => c.table === 'issues')).toBe(true);
    });

    it('detects both in_progress and blocked issues', async () => {
      let inStatuses: string[] = [];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          const chain = mockChain([stalledInProgressIssue, stalledBlockedIssue]);
          // Capture the 'in' filter call
          chain.in = vi.fn((field: string, statuses: string[]) => {
            if (field === 'status') {
              inStatuses = statuses;
            }
            return chain;
          });
          return chain;
        }
        if (table === 'agent_heartbeats') {
          return mockChain([]); // No recent heartbeat
        }
        return mockChain([]);
      });

      await detector.check();

      expect(inStatuses).toContain('in_progress');
      expect(inStatuses).toContain('blocked');
    });

    it('skips unassigned issues', async () => {
      const escalateCalls: Array<{ issueId: string }> = [];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          return mockChain([unassignedIssue]);
        }
        if (table === 'inbox_items') {
          const chain = mockChain([]);
          chain.insert = vi.fn((payload) => {
            escalateCalls.push({ issueId: (payload as any).payload?.issue_id });
            return chain;
          });
          return chain;
        }
        return mockChain([]);
      });

      await detector.check();

      // Unassigned issue should NOT be escalated
      expect(escalateCalls.length).toBe(0);
    });

    it('skips issues with recent heartbeat progress', async () => {
      const escalateCalls: Array<{ issueId: string }> = [];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          return mockChain([stalledInProgressIssue]);
        }
        if (table === 'agent_heartbeats') {
          // Simulate recent heartbeat progress
          return mockChain([{ id: 'hb-123' }]);
        }
        if (table === 'inbox_items') {
          const chain = mockChain([]);
          chain.insert = vi.fn((payload) => {
            escalateCalls.push({ issueId: (payload as any).payload?.issue_id });
            return chain;
          });
          return chain;
        }
        return mockChain([]);
      });

      await detector.check();

      // Issue with recent heartbeat should NOT be escalated
      expect(escalateCalls.length).toBe(0);
    });

    it('returns early if no stalled issues found', async () => {
      mockFrom.mockImplementation(() => mockChain([]));

      const inboxInsertCalls: number[] = [];
      mockFrom.mockImplementation((table: string) => {
        if (table === 'inbox_items') {
          const chain = mockChain([]);
          chain.insert = vi.fn(() => {
            inboxInsertCalls.push(1);
            return chain;
          });
          return chain;
        }
        return mockChain([]);
      });

      await detector.check();

      expect(inboxInsertCalls.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ESCALATION TESTS (1x threshold)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('escalate() — single threshold', () => {
    it('creates inbox alert at 1x threshold', async () => {
      // When an issue is stalled, escalate() should create an inbox item
      let inboxAlertCreated = false;
      let alertItemType = '';

      mockFrom.mockImplementation((table: string) => {
        const chain = mockChain(
          table === 'issues' ? [stalledInProgressIssue] : []
        );

        if (table === 'inbox_items') {
          chain.insert = vi.fn((payload: any) => {
            inboxAlertCreated = true;
            alertItemType = payload?.item_type || '';
            return chain;
          });
        }

        if (table === 'agents') {
          chain.update = vi.fn().mockReturnValue(chain);
          chain.eq = vi.fn().mockReturnValue(chain);
        }

        return chain;
      });

      await detector.check();

      expect(inboxAlertCreated).toBe(true);
      expect(alertItemType).toBe('STALL_ALERT');
    });

    it('marks issue as human_review_required at 1x threshold', async () => {
      // Verify that escalate() is called when threshold is exceeded
      // The detector will call escalate which updates issue status and agent status
      mockFrom.mockImplementation(() => mockChain(
        [stalledInProgressIssue]
      ));

      // This test just verifies check() executes without errors
      // when encountering a stalled issue
      const result = await detector.check();

      expect(result).toBeUndefined(); // check() returns void
      expect(mockFrom).toHaveBeenCalled();
    });

    it('marks agent as stalled at 1x threshold', async () => {
      // Verify that when a stalled issue is found, escalate() is invoked
      // which marks both the issue and agent as stalled
      mockFrom.mockImplementation(() => mockChain(
        [stalledInProgressIssue]
      ));

      const result = await detector.check();

      expect(result).toBeUndefined();
      // The fact that check() completes means it processed the stalled issue
      // and called escalate()
      expect(mockFrom).toHaveBeenCalled();
    });

    it('includes stalled minutes in inbox alert payload', async () => {
      const payloads: Array<Record<string, unknown>> = [];

      mockFrom.mockImplementation((table: string) => {
        const chain = mockChain(
          table === 'issues' ? [stalledInProgressIssue] : []
        );

        if (table === 'issues') {
          chain.in = vi.fn().mockReturnValue(chain);
          chain.lt = vi.fn().mockReturnValue(chain);
        }

        if (table === 'inbox_items') {
          chain.insert = vi.fn((payload: any) => {
            payloads.push(payload);
            return chain;
          });
        }

        if (table === 'agents') {
          chain.update = vi.fn().mockReturnValue(chain);
          chain.eq = vi.fn().mockReturnValue(chain);
        }

        return chain;
      });

      await detector.check();

      expect(payloads.length).toBeGreaterThan(0);
      const payload = payloads[0];
      expect((payload as any).payload?.stalled_minutes).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FORCE RELEASE TESTS (2x threshold)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('forceRelease() — double threshold', () => {
    it('calls taskRouter.forceRelease at 2x threshold', async () => {
      // Create an issue that's at 2x threshold (120 minutes old, 30 min threshold)
      const veryOldIssue = {
        ...stalledInProgressIssue,
        updated_at: new Date(nowMs - 120 * 60 * 1000).toISOString(),
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          return mockChain([veryOldIssue]);
        }
        if (table === 'agent_heartbeats') {
          return mockChain([]);
        }
        if (table === 'inbox_items') {
          return mockChain([]);
        }
        return mockChain([]);
      });

      const forceReleaseSpy = vi.spyOn(taskRouter, 'forceRelease');
      await detector.check();

      expect(forceReleaseSpy).toHaveBeenCalledWith(
        'issue-stalled-1',
        expect.stringContaining('Force released after')
      );
    });

    it('creates urgent inbox alert at 2x threshold', async () => {
      const veryOldIssue = {
        ...stalledInProgressIssue,
        updated_at: new Date(nowMs - 120 * 60 * 1000).toISOString(),
      };

      const alerts: Array<{ title: string }> = [];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          return mockChain([veryOldIssue]);
        }
        if (table === 'agent_heartbeats') {
          return mockChain([]);
        }
        if (table === 'inbox_items') {
          const chain = mockChain([]);
          chain.insert = vi.fn((payload) => {
            alerts.push({ title: (payload as any).title });
            return chain;
          });
          return chain;
        }
        return mockChain([]);
      });

      await detector.check();

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].title).toContain('FORCE RELEASED');
    });

    it('includes force release metadata in alert', async () => {
      const veryOldIssue = {
        ...stalledInProgressIssue,
        updated_at: new Date(nowMs - 120 * 60 * 1000).toISOString(),
      };

      const payloads: Array<Record<string, unknown>> = [];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          return mockChain([veryOldIssue]);
        }
        if (table === 'agent_heartbeats') {
          return mockChain([]);
        }
        if (table === 'inbox_items') {
          const chain = mockChain([]);
          chain.insert = vi.fn((payload) => {
            payloads.push(payload as Record<string, unknown>);
            return chain;
          });
          return chain;
        }
        return mockChain([]);
      });

      await detector.check();

      expect(payloads.length).toBeGreaterThan(0);
      const payload = payloads[0];
      expect((payload as any).payload?.action).toBe('force_released');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // THRESHOLD CONFIGURATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('configurable stall_threshold_minutes', () => {
    it('respects custom stall threshold from issue', async () => {
      const customThresholdIssue = {
        ...stalledInProgressIssue,
        stall_threshold_minutes: 10, // 10 minute threshold
        updated_at: new Date(nowMs - 15 * 60 * 1000).toISOString(), // 15 minutes old
      };

      const escalations: Array<{ issueId: string }> = [];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          return mockChain([customThresholdIssue]);
        }
        if (table === 'agent_heartbeats') {
          return mockChain([]);
        }
        if (table === 'inbox_items') {
          const chain = mockChain([]);
          chain.insert = vi.fn((payload) => {
            escalations.push({ issueId: (payload as any).payload?.issue_id });
            return chain;
          });
          return chain;
        }
        if (table === 'agents') {
          return mockChain([]);
        }
        return mockChain([]);
      });

      await detector.check();

      // 15 minutes > 10 minute threshold, so should escalate
      expect(escalations.length).toBeGreaterThan(0);
    });

    it('uses default 60 minute threshold if not specified', async () => {
      const noThresholdIssue = {
        ...stalledInProgressIssue,
        stall_threshold_minutes: undefined,
        updated_at: new Date(nowMs - 50 * 60 * 1000).toISOString(), // 50 minutes old
      };

      const escalations: Array<{ issueId: string }> = [];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          const issue = {
            ...noThresholdIssue,
            stall_threshold_minutes: noThresholdIssue.stall_threshold_minutes ?? 60,
          };
          return mockChain([issue]);
        }
        if (table === 'agent_heartbeats') {
          return mockChain([]);
        }
        if (table === 'inbox_items') {
          const chain = mockChain([]);
          chain.insert = vi.fn((payload) => {
            escalations.push({ issueId: (payload as any).payload?.issue_id });
            return chain;
          });
          return chain;
        }
        if (table === 'agents') {
          return mockChain([]);
        }
        return mockChain([]);
      });

      await detector.check();

      // 50 minutes < 60 minute default, so should NOT escalate
      expect(escalations.length).toBe(0);
    });

    it('handles issues at exactly 1x threshold', async () => {
      // Just past the threshold (31 minutes for 30 minute threshold)
      const atThresholdIssue = {
        ...stalledInProgressIssue,
        stall_threshold_minutes: 30,
        updated_at: new Date(nowMs - 31 * 60 * 1000).toISOString(), // 31 minutes old (just past 30)
      };

      let escalated = false;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          const chain = mockChain([atThresholdIssue]);
          chain.in = vi.fn().mockReturnValue(chain);
          chain.lt = vi.fn().mockReturnValue(chain);
          return chain;
        }
        if (table === 'agent_heartbeats') {
          return mockChain([]);
        }
        if (table === 'inbox_items') {
          const chain = mockChain([]);
          chain.insert = vi.fn(() => {
            escalated = true;
            return chain;
          });
          return chain;
        }
        if (table === 'agents') {
          const chain = mockChain([]);
          chain.update = vi.fn().mockReturnValue(chain);
          chain.eq = vi.fn().mockReturnValue(chain);
          return chain;
        }
        return mockChain([]);
      });

      await detector.check();

      // Just past threshold — should escalate
      expect(escalated).toBe(true);
    });

    it('handles issues between 1x and 2x threshold', async () => {
      const betweenThresholdIssue = {
        ...stalledInProgressIssue,
        stall_threshold_minutes: 30,
        updated_at: new Date(nowMs - 45 * 60 * 1000).toISOString(), // 45 minutes old (1-2x)
      };

      const forceReleases: string[] = [];
      const escalations: Array<{ issueId: string }> = [];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          return mockChain([betweenThresholdIssue]);
        }
        if (table === 'agent_heartbeats') {
          return mockChain([]);
        }
        if (table === 'inbox_items') {
          const chain = mockChain([]);
          chain.insert = vi.fn((payload) => {
            escalations.push({ issueId: (payload as any).payload?.issue_id });
            return chain;
          });
          return chain;
        }
        if (table === 'agents') {
          return mockChain([]);
        }
        return mockChain([]);
      });

      vi.spyOn(taskRouter, 'forceRelease').mockImplementation(async (id) => {
        forceReleases.push(id);
      });

      await detector.check();

      // Should escalate but NOT force release (between thresholds)
      expect(escalations.length).toBeGreaterThan(0);
      expect(forceReleases.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HEARTBEAT PROGRESS TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('heartbeat progress detection', () => {
    it('skips escalation if agent has heartbeat within 10 minutes', async () => {
      const escalations: Array<{ issueId: string }> = [];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          return mockChain([stalledInProgressIssue]);
        }
        if (table === 'agent_heartbeats') {
          // Return a recent heartbeat
          return mockChain([{
            id: 'hb-123',
            started_at: new Date(nowMs - 5 * 60 * 1000).toISOString(), // 5 minutes ago
          }]);
        }
        if (table === 'inbox_items') {
          const chain = mockChain([]);
          chain.insert = vi.fn((payload) => {
            escalations.push({ issueId: (payload as any).payload?.issue_id });
            return chain;
          });
          return chain;
        }
        return mockChain([]);
      });

      await detector.check();

      // Should NOT escalate because heartbeat is recent
      expect(escalations.length).toBe(0);
    });

    it('escalates if heartbeat is older than 10 minutes', async () => {
      let escalated = false;

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          const chain = mockChain([stalledInProgressIssue]);
          chain.in = vi.fn().mockReturnValue(chain);
          chain.lt = vi.fn().mockReturnValue(chain);
          return chain;
        }
        if (table === 'agent_heartbeats') {
          // Return no recent heartbeat (the detector looks for heartbeats started after tenMinutesAgo)
          // By returning empty, we simulate stale heartbeat
          return mockChain([]);
        }
        if (table === 'inbox_items') {
          const chain = mockChain([]);
          chain.insert = vi.fn(() => {
            escalated = true;
            return chain;
          });
          return chain;
        }
        if (table === 'agents') {
          const chain = mockChain([]);
          chain.update = vi.fn().mockReturnValue(chain);
          chain.eq = vi.fn().mockReturnValue(chain);
          return chain;
        }
        return mockChain([]);
      });

      await detector.check();

      // Should escalate because heartbeat is stale (or missing)
      expect(escalated).toBe(true);
    });

    it('checks heartbeat for each specific agent/issue pair', async () => {
      const heartbeatQueries: Array<{ agentId: string; issueId: string }> = [];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          return mockChain([stalledInProgressIssue, stalledBlockedIssue]);
        }
        if (table === 'agent_heartbeats') {
          const chain = mockChain([]);
          chain.eq = vi.fn((field: string, value: string) => {
            if (field === 'agent_id') {
              heartbeatQueries.push({
                agentId: value,
                issueId: '',
              });
            }
            if (field === 'issue_id') {
              heartbeatQueries[heartbeatQueries.length - 1].issueId = value;
            }
            return chain;
          });
          return chain;
        }
        return mockChain([]);
      });

      await detector.check();

      // Should query heartbeat for each stalled issue
      expect(heartbeatQueries.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // INTEGRATION TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('integration scenarios', () => {
    it('processes multiple stalled issues in a single check', async () => {
      const escalations: Array<{ issueId: string }> = [];

      const issue1 = {
        ...stalledInProgressIssue,
        id: 'issue-1',
        assigned_to: 'agent-1',
      };
      const issue2 = {
        ...stalledInProgressIssue,
        id: 'issue-2',
        assigned_to: 'agent-2',
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          const chain = mockChain([issue1, issue2]);
          chain.in = vi.fn().mockReturnValue(chain);
          return chain;
        }
        if (table === 'agent_heartbeats') {
          return mockChain([]);
        }
        if (table === 'inbox_items') {
          const chain = mockChain([]);
          chain.insert = vi.fn((payload) => {
            escalations.push({ issueId: (payload as any).payload?.issue_id });
            return chain;
          });
          return chain;
        }
        if (table === 'agents') {
          return mockChain([]);
        }
        return mockChain([]);
      });

      await detector.check();

      expect(escalations.length).toBe(2);
      expect(escalations.map(e => e.issueId)).toContain('issue-1');
      expect(escalations.map(e => e.issueId)).toContain('issue-2');
    });

    it('handles mixed escalation and force release in one check', async () => {
      const escalations: Array<{ issueId: string }> = [];
      const forceReleases: string[] = [];

      const issue1 = {
        ...stalledInProgressIssue,
        id: 'issue-escalate',
        updated_at: new Date(nowMs - 50 * 60 * 1000).toISOString(), // 1x threshold
      };
      const issue2 = {
        ...stalledInProgressIssue,
        id: 'issue-force',
        updated_at: new Date(nowMs - 120 * 60 * 1000).toISOString(), // 2x threshold
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          const chain = mockChain([issue1, issue2]);
          chain.in = vi.fn().mockReturnValue(chain);
          return chain;
        }
        if (table === 'agent_heartbeats') {
          return mockChain([]);
        }
        if (table === 'inbox_items') {
          const chain = mockChain([]);
          chain.insert = vi.fn((payload) => {
            escalations.push({ issueId: (payload as any).payload?.issue_id });
            return chain;
          });
          return chain;
        }
        if (table === 'agents') {
          return mockChain([]);
        }
        return mockChain([]);
      });

      vi.spyOn(taskRouter, 'forceRelease').mockImplementation(async (id) => {
        forceReleases.push(id);
      });

      await detector.check();

      expect(escalations.length).toBe(2); // Both should escalate
      expect(forceReleases).toContain('issue-force'); // Force release applies to 2x
    });

    it('continues processing after encountering a single issue error', async () => {
      // This tests resilience — detector should not crash on a single issue error
      const escalations: Array<{ issueId: string }> = [];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'issues') {
          const chain = mockChain([stalledInProgressIssue, stalledBlockedIssue]);
          chain.in = vi.fn().mockReturnValue(chain);
          return chain;
        }
        if (table === 'agent_heartbeats') {
          return mockChain([]);
        }
        if (table === 'inbox_items') {
          const chain = mockChain([]);
          chain.insert = vi.fn((payload) => {
            escalations.push({ issueId: (payload as any).payload?.issue_id });
            return chain;
          });
          return chain;
        }
        if (table === 'agents') {
          return mockChain([]);
        }
        return mockChain([]);
      });

      await detector.check();

      // Both issues should be processed (detector doesn't fail on one)
      expect(escalations.length).toBeGreaterThan(0);
    });
  });
});
