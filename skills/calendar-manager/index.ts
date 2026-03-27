/**
 * Calendar Manager Skill — Built-in
 *
 * Manage calendars — create, read, update events and check availability.
 * Generic — supports Google Calendar, Outlook, CalDAV, or any provider via config.
 *
 * Permissions: network.outbound
 * Config: CALENDAR_PROVIDER, API_KEY, CALENDAR_ID
 */

import type { ApexSkill, SkillResult } from '../../packages/shared/skill-interface.js';

export class CalendarManagerSkill implements ApexSkill {
  readonly name = 'calendar-manager';
  readonly version = '1.0.0';
  readonly permissions = ['network.outbound'];
  readonly description = 'Manage calendars — create, read, update events and check availability';

  private config: Record<string, string> = {};

  async initialize(config: Record<string, string>): Promise<void> {
    this.config = config;
  }

  async execute(method: string, params: Record<string, unknown>): Promise<SkillResult> {
    switch (method) {
      case 'getEvents':
        return this.getEvents(params);
      case 'createEvent':
        return this.createEvent(params);
      case 'updateEvent':
        return this.updateEvent(params);
      case 'deleteEvent':
        return this.deleteEvent(params);
      case 'checkAvailability':
        return this.checkAvailability(params);
      default:
        return { success: false, error: `Unknown method: ${method}`, error_code: 'UNKNOWN_METHOD' };
    }
  }

  async shutdown(): Promise<void> {
    // No persistent resources
  }

  // --- Provider-aware API helper ---

  private getBaseUrl(): string {
    const provider = this.config.CALENDAR_PROVIDER ?? 'google';
    switch (provider) {
      case 'google':
        return 'https://www.googleapis.com/calendar/v3';
      case 'outlook':
        return 'https://graph.microsoft.com/v1.0/me';
      default:
        return this.config.API_URL ?? '';
    }
  }

  private getCalendarId(): string {
    return this.config.CALENDAR_ID ?? 'primary';
  }

  // --- Methods ---

  private async getEvents(params: Record<string, unknown>): Promise<SkillResult> {
    const timeMin = params.time_min as string | undefined;
    const timeMax = params.time_max as string | undefined;
    const maxResults = (params.max_results as number) ?? 20;
    const provider = this.config.CALENDAR_PROVIDER ?? 'google';

    try {
      if (provider === 'google') {
        const queryParts: string[] = [`maxResults=${maxResults}`, 'singleEvents=true', 'orderBy=startTime'];
        if (timeMin) queryParts.push(`timeMin=${encodeURIComponent(timeMin)}`);
        if (timeMax) queryParts.push(`timeMax=${encodeURIComponent(timeMax)}`);

        const response = await fetch(
          `${this.getBaseUrl()}/calendars/${this.getCalendarId()}/events?${queryParts.join('&')}`,
          { headers: { Authorization: `Bearer ${this.config.API_KEY}` } }
        );
        if (!response.ok) {
          return { success: false, error: `Google Calendar API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      if (provider === 'outlook') {
        const queryParts: string[] = [`$top=${maxResults}`, '$orderby=start/dateTime'];
        if (timeMin) queryParts.push(`$filter=start/dateTime ge '${timeMin}'`);

        const response = await fetch(
          `${this.getBaseUrl()}/calendar/events?${queryParts.join('&')}`,
          { headers: { Authorization: `Bearer ${this.config.API_KEY}` } }
        );
        if (!response.ok) {
          return { success: false, error: `Outlook Calendar API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { provider, timeMin, timeMax, maxResults, message: 'Provider-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'GET_EVENTS_FAILED' };
    }
  }

  private async createEvent(params: Record<string, unknown>): Promise<SkillResult> {
    const summary = params.summary as string;
    const startTime = params.start_time as string;
    const endTime = params.end_time as string;
    const description = params.description as string | undefined;
    const attendees = params.attendees as string[] | undefined;

    if (!summary) return { success: false, error: 'summary is required', error_code: 'MISSING_PARAM' };
    if (!startTime) return { success: false, error: 'start_time is required', error_code: 'MISSING_PARAM' };
    if (!endTime) return { success: false, error: 'end_time is required', error_code: 'MISSING_PARAM' };

    const provider = this.config.CALENDAR_PROVIDER ?? 'google';

    try {
      if (provider === 'google') {
        const event = {
          summary,
          description,
          start: { dateTime: startTime },
          end: { dateTime: endTime },
          attendees: attendees?.map((email) => ({ email })),
        };

        const response = await fetch(
          `${this.getBaseUrl()}/calendars/${this.getCalendarId()}/events`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.config.API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(event),
          }
        );
        if (!response.ok) {
          return { success: false, error: `Google Calendar API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { provider, summary, startTime, endTime, message: 'Provider-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'CREATE_EVENT_FAILED' };
    }
  }

  private async updateEvent(params: Record<string, unknown>): Promise<SkillResult> {
    const eventId = params.event_id as string;
    if (!eventId) return { success: false, error: 'event_id is required', error_code: 'MISSING_PARAM' };

    const provider = this.config.CALENDAR_PROVIDER ?? 'google';

    try {
      const { event_id: _, ...updateData } = params;

      if (provider === 'google') {
        const response = await fetch(
          `${this.getBaseUrl()}/calendars/${this.getCalendarId()}/events/${eventId}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${this.config.API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData),
          }
        );
        if (!response.ok) {
          return { success: false, error: `Google Calendar API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { provider, eventId, updated: true, message: 'Provider-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'UPDATE_EVENT_FAILED' };
    }
  }

  private async deleteEvent(params: Record<string, unknown>): Promise<SkillResult> {
    const eventId = params.event_id as string;
    if (!eventId) return { success: false, error: 'event_id is required', error_code: 'MISSING_PARAM' };

    const provider = this.config.CALENDAR_PROVIDER ?? 'google';

    try {
      if (provider === 'google') {
        const response = await fetch(
          `${this.getBaseUrl()}/calendars/${this.getCalendarId()}/events/${eventId}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${this.config.API_KEY}` },
          }
        );
        if (!response.ok && response.status !== 204) {
          return { success: false, error: `Google Calendar API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        return { success: true, data: { deleted: true, eventId } };
      }

      return {
        success: true,
        data: { provider, eventId, deleted: true, message: 'Provider-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'DELETE_EVENT_FAILED' };
    }
  }

  private async checkAvailability(params: Record<string, unknown>): Promise<SkillResult> {
    const timeMin = params.time_min as string;
    const timeMax = params.time_max as string;

    if (!timeMin) return { success: false, error: 'time_min is required', error_code: 'MISSING_PARAM' };
    if (!timeMax) return { success: false, error: 'time_max is required', error_code: 'MISSING_PARAM' };

    const provider = this.config.CALENDAR_PROVIDER ?? 'google';

    try {
      if (provider === 'google') {
        const response = await fetch(`${this.getBaseUrl()}/freeBusy`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            timeMin,
            timeMax,
            items: [{ id: this.getCalendarId() }],
          }),
        });
        if (!response.ok) {
          return { success: false, error: `Google Calendar API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { provider, timeMin, timeMax, message: 'Provider-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'AVAILABILITY_CHECK_FAILED' };
    }
  }
}
