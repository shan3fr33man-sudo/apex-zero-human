import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  interpolate,
  interpolateTemplate,
  buildContext,
  type InterpolationContext,
} from '../interpolator.js';

vi.mock('../../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Interpolator', () => {
  describe('interpolate()', () => {
    it('replaces simple template variables', () => {
      const template = 'Hello {{name}}, welcome to {{company}}';
      const context: InterpolationContext = {
        name: 'Alice',
        company: 'ACME Corp',
      };

      const result = interpolate(template, context);

      expect(result).toBe('Hello Alice, welcome to ACME Corp');
    });

    it('handles multiple occurrences of same variable', () => {
      const template = '{{user}} met {{user}} at {{location}}';
      const context: InterpolationContext = {
        user: 'Bob',
        location: 'office',
      };

      const result = interpolate(template, context);

      expect(result).toBe('Bob met Bob at office');
    });

    it('replaces nested object properties via dot notation', () => {
      const template = 'Call from {{event.caller_name}} at {{event.phone}}';
      const context: InterpolationContext = {
        event: {
          caller_name: 'John',
          phone: '555-1234',
        },
      };

      const result = interpolate(template, context);

      expect(result).toBe('Call from John at 555-1234');
    });

    it('supports deeply nested paths', () => {
      const template = 'Order {{order.details.id}} for {{order.customer.name}}';
      const context: InterpolationContext = {
        order: {
          details: { id: '12345' },
          customer: { name: 'Carol' },
        },
      };

      const result = interpolate(template, context);

      expect(result).toBe('Order 12345 for Carol');
    });

    it('uses default value when variable is missing', () => {
      const template = 'Caller: {{caller_name|Unknown}}';
      const context: InterpolationContext = {};

      const result = interpolate(template, context);

      expect(result).toBe('Caller: Unknown');
    });

    it('uses default value when nested path is missing', () => {
      const template = 'Phone: {{event.phone|No phone provided}}';
      const context: InterpolationContext = {
        event: {},
      };

      const result = interpolate(template, context);

      expect(result).toBe('Phone: No phone provided');
    });

    it('uses default value when variable is null', () => {
      const template = 'Status: {{status|Pending}}';
      const context: InterpolationContext = {
        status: null,
      };

      const result = interpolate(template, context);

      expect(result).toBe('Status: Pending');
    });

    it('uses default value when variable is undefined', () => {
      const template = 'Note: {{note|No notes}}';
      const context: InterpolationContext = {
        note: undefined,
      };

      const result = interpolate(template, context);

      expect(result).toBe('Note: No notes');
    });

    it('replaces variables with numbers', () => {
      const template = 'Total: ${{amount}}';
      const context: InterpolationContext = {
        amount: 99.99,
      };

      const result = interpolate(template, context);

      expect(result).toBe('Total: $99.99');
    });

    it('replaces variables with booleans', () => {
      const template = 'Active: {{is_active}}';
      const context: InterpolationContext = {
        is_active: true,
      };

      const result = interpolate(template, context);

      expect(result).toBe('Active: true');
    });

    it('converts objects to JSON strings', () => {
      const template = 'Metadata: {{data}}';
      const context: InterpolationContext = {
        data: { key: 'value', count: 42 },
      };

      const result = interpolate(template, context);

      expect(result).toContain('key');
      expect(result).toContain('value');
    });

    it('handles empty template', () => {
      const template = '';
      const context: InterpolationContext = { name: 'Alice' };

      const result = interpolate(template, context);

      expect(result).toBe('');
    });

    it('handles template with no variables', () => {
      const template = 'Just plain text';
      const context: InterpolationContext = { name: 'Alice' };

      const result = interpolate(template, context);

      expect(result).toBe('Just plain text');
    });

    it('handles whitespace in variable names', () => {
      const template = 'Name: {{ name_with_spaces }}';
      const context: InterpolationContext = {
        name_with_spaces: 'Bob Smith',
      };

      const result = interpolate(template, context);

      expect(result).toBe('Name: Bob Smith');
    });

    it('supports pipe character in default value', () => {
      const template = 'URL: {{url|https://example.com?a=1|b=2}}';
      const context: InterpolationContext = {};

      const result = interpolate(template, context);

      expect(result).toBe('URL: https://example.com?a=1|b=2');
    });

    it('returns empty string when variable missing without default', () => {
      const template = 'Name: {{missing_var}}';
      const context: InterpolationContext = {};

      const result = interpolate(template, context);

      expect(result).toBe('Name: ');
    });

    it('handles variables at start of template', () => {
      const template = '{{greeting}} everyone';
      const context: InterpolationContext = {
        greeting: 'Hello',
      };

      const result = interpolate(template, context);

      expect(result).toBe('Hello everyone');
    });

    it('handles variables at end of template', () => {
      const template = 'Sincerely, {{signature}}';
      const context: InterpolationContext = {
        signature: 'John Doe',
      };

      const result = interpolate(template, context);

      expect(result).toBe('Sincerely, John Doe');
    });

    it('handles adjacent variables', () => {
      const template = '{{first}}{{second}}';
      const context: InterpolationContext = {
        first: 'Hello ',
        second: 'World',
      };

      const result = interpolate(template, context);

      expect(result).toBe('Hello World');
    });
  });

  describe('interpolateTemplate()', () => {
    it('interpolates all template fields', () => {
      const template = {
        title: 'Issue for {{company_name}}',
        description: 'Priority: {{priority}}, Owner: {{owner}}',
        success_condition: '{{owner}} completes task',
        assigned_role: 'engineer',
        priority: 1,
      };

      const context: InterpolationContext = {
        company_name: 'Tech Inc',
        priority: 'High',
        owner: 'Alice',
      };

      const result = interpolateTemplate(template, context);

      expect(result.title).toBe('Issue for Tech Inc');
      expect(result.description).toBe('Priority: High, Owner: Alice');
      expect(result.success_condition).toBe('Alice completes task');
    });

    it('preserves assigned_role without interpolation', () => {
      const template = {
        title: 'Test {{name}}',
        description: 'Desc',
        success_condition: 'Done',
        assigned_role: '{{role}}',
        priority: 1,
      };

      const context: InterpolationContext = {
        name: 'Bob',
        role: 'engineer',
      };

      const result = interpolateTemplate(template, context);

      // assigned_role should NOT be interpolated
      expect(result.assigned_role).toBe('{{role}}');
    });

    it('preserves priority without interpolation', () => {
      const template = {
        title: 'Test',
        description: 'Desc',
        success_condition: 'Done',
        assigned_role: 'engineer',
        priority: 2,
      };

      const context: InterpolationContext = {};

      const result = interpolateTemplate(template, context);

      expect(result.priority).toBe(2);
    });

    it('preserves metadata field', () => {
      const template = {
        title: 'Test',
        description: 'Desc',
        success_condition: 'Done',
        assigned_role: 'engineer',
        priority: 1,
        metadata: { source: 'routine-123', custom: true },
      };

      const context: InterpolationContext = {};

      const result = interpolateTemplate(template, context);

      expect(result.metadata).toEqual({
        source: 'routine-123',
        custom: true,
      });
    });

    it('returns full interpolated template object', () => {
      const template = {
        title: 'Test {{event}}',
        description: 'Handling {{event}}',
        success_condition: '{{event}} resolved',
        assigned_role: 'dispatch',
        priority: 1,
      };

      const context: InterpolationContext = {
        event: 'missed_call',
      };

      const result = interpolateTemplate(template, context);

      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('success_condition');
      expect(result).toHaveProperty('assigned_role');
      expect(result).toHaveProperty('priority');
    });
  });

  describe('buildContext()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-06T14:30:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('builds context with basic company data', () => {
      const context = buildContext({
        companyId: 'company-1',
        companyName: 'ACME Corp',
        routineName: 'Daily Sync',
      });

      expect(context.company_id).toBe('company-1');
      expect(context.company_name).toBe('ACME Corp');
      expect(context.routine_name).toBe('Daily Sync');
    });

    it('includes date in YYYY-MM-DD format', () => {
      const context = buildContext({
        companyId: 'company-1',
        companyName: 'Test',
        routineName: 'Test',
      });

      expect(context.date).toBe('2026-04-06');
      expect(typeof context.date).toBe('string');
    });

    it('includes time in HH:MM:SS format', () => {
      const context = buildContext({
        companyId: 'company-1',
        companyName: 'Test',
        routineName: 'Test',
      });

      expect(context.time).toMatch(/^\d{2}:\d{2}:\d{2}/);
    });

    it('includes datetime as ISO string', () => {
      const context = buildContext({
        companyId: 'company-1',
        companyName: 'Test',
        routineName: 'Test',
      });

      expect(context.datetime).toContain('T');
      expect(context.datetime).toContain('Z');
      expect(() => new Date(context.datetime as string)).not.toThrow();
    });

    it('includes timestamp as milliseconds', () => {
      const context = buildContext({
        companyId: 'company-1',
        companyName: 'Test',
        routineName: 'Test',
      });

      expect(typeof context.timestamp).toBe('number');
      expect(context.timestamp).toBeGreaterThan(0);
    });

    it('handles missing company name with empty string default', () => {
      const context = buildContext({
        companyId: 'company-1',
        routineName: 'Test',
      });

      expect(context.company_name).toBe('');
    });

    it('includes event type and payload when event provided', () => {
      const context = buildContext({
        companyId: 'company-1',
        companyName: 'Test',
        routineName: 'Test',
        event: {
          event_type: 'missed_call',
          payload: { caller: '555-1234', duration: 45 },
        },
      });

      expect(context.event_type).toBe('missed_call');
      expect(context.event).toEqual({
        caller: '555-1234',
        duration: 45,
      });
    });

    it('merges extra context options', () => {
      const context = buildContext({
        companyId: 'company-1',
        companyName: 'Test',
        routineName: 'Test',
        extra: {
          custom_field: 'custom_value',
          another_field: 123,
        },
      });

      expect(context.custom_field).toBe('custom_value');
      expect(context.another_field).toBe(123);
    });

    it('preserves all required fields together', () => {
      const context = buildContext({
        companyId: 'company-1',
        companyName: 'Test Corp',
        routineName: 'Hourly Check',
        event: {
          event_type: 'alert',
          payload: { severity: 'high' },
        },
        extra: { env: 'prod' },
      });

      expect(context).toHaveProperty('company_id');
      expect(context).toHaveProperty('company_name');
      expect(context).toHaveProperty('routine_name');
      expect(context).toHaveProperty('date');
      expect(context).toHaveProperty('time');
      expect(context).toHaveProperty('datetime');
      expect(context).toHaveProperty('timestamp');
      expect(context).toHaveProperty('event_type');
      expect(context).toHaveProperty('event');
      expect(context).toHaveProperty('env');
    });
  });

  describe('edge cases', () => {
    it('handles template with braces in content', () => {
      const template = 'Code: {console.log}';
      const context: InterpolationContext = {};

      const result = interpolate(template, context);

      expect(result).toBe('Code: {console.log}');
    });

    it('handles incomplete variable syntax without replacement', () => {
      const template = 'Text with { variable } inside';
      const context: InterpolationContext = { variable: 'value' };

      const result = interpolate(template, context);

      // Should not interpolate since syntax is wrong
      expect(result).toBe('Text with { variable } inside');
    });

    it('handles special characters in variable values', () => {
      const template = 'Message: {{msg}}';
      const context: InterpolationContext = {
        msg: 'Hello & goodbye <world>!',
      };

      const result = interpolate(template, context);

      expect(result).toBe('Message: Hello & goodbye <world>!');
    });

    it('handles very long variable values', () => {
      const longString = 'a'.repeat(10000);
      const template = 'Content: {{data}}';
      const context: InterpolationContext = { data: longString };

      const result = interpolate(template, context);

      expect(result).toContain(longString);
    });

    it('handles null in context object', () => {
      const template = 'Value: {{field|default}}';
      const context: InterpolationContext = { field: null };

      const result = interpolate(template, context);

      expect(result).toBe('Value: default');
    });

    it('handles deeply missing nested path', () => {
      const template = '{{a.b.c.d.e.f}}';
      const context: InterpolationContext = { a: { b: {} } };

      const result = interpolate(template, context);

      expect(result).toBe('');
    });

    it('handles array values by converting to string', () => {
      const template = 'Items: {{items}}';
      const context: InterpolationContext = {
        items: [1, 2, 3],
      };

      const result = interpolate(template, context);

      expect(result).toContain('1');
      expect(result).toContain('2');
      expect(result).toContain('3');
    });
  });
});
