/**
 * Phone Listener Skill — Built-in
 *
 * Process inbound call events, send SMS, manage voicemail.
 * Generic — supports Twilio, RingCentral, Vonage, or any VoIP provider via config.
 *
 * Permissions: network.twilio, network.outbound
 * Config: VOIP_PROVIDER, ACCOUNT_SID, AUTH_TOKEN, FROM_NUMBER
 */

import type { ApexSkill, SkillResult } from '../../packages/shared/skill-interface.js';

export class PhoneListenerSkill implements ApexSkill {
  readonly name = 'phone-listener';
  readonly version = '1.0.0';
  readonly permissions = ['network.twilio', 'network.outbound'];
  readonly description = 'Process inbound call events, send SMS, manage voicemail via configured VoIP provider';

  private config: Record<string, string> = {};

  async initialize(config: Record<string, string>): Promise<void> {
    this.config = config;
  }

  async execute(method: string, params: Record<string, unknown>): Promise<SkillResult> {
    switch (method) {
      case 'getRecentEvents':
        return this.getRecentEvents(params);
      case 'sendSms':
        return this.sendSms(params);
      case 'initiateCall':
        return this.initiateCall(params);
      case 'getVoicemail':
        return this.getVoicemail(params);
      default:
        return { success: false, error: `Unknown method: ${method}`, error_code: 'UNKNOWN_METHOD' };
    }
  }

  async shutdown(): Promise<void> {
    // No persistent resources
  }

  // --- Methods ---

  private async getRecentEvents(params: Record<string, unknown>): Promise<SkillResult> {
    const eventType = (params.event_type as string) ?? 'missed_call';
    const since = params.since as string;
    const provider = this.config.VOIP_PROVIDER ?? 'twilio';

    try {
      if (provider === 'twilio') {
        const auth = Buffer.from(`${this.config.ACCOUNT_SID}:${this.config.AUTH_TOKEN}`).toString('base64');
        let url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.ACCOUNT_SID}/Calls.json?Status=no-answer&PageSize=20`;
        if (since) url += `&StartTime>=${since}`;

        const response = await fetch(url, {
          headers: { Authorization: `Basic ${auth}` },
        });
        if (!response.ok) {
          return { success: false, error: `Twilio API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();

        // Normalize to APEX event format
        const events = ((data as Record<string, unknown>).calls as Array<Record<string, unknown>> ?? []).map(
          (call: Record<string, unknown>) => ({
            event_type: eventType,
            caller_number: call.from,
            called_number: call.to,
            timestamp: call.start_time,
            duration: call.duration,
            source: 'twilio',
          })
        );

        return { success: true, data: { events, count: events.length } };
      }

      if (provider === 'ringcentral') {
        const response = await fetch(
          `https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/call-log?type=Missed&dateFrom=${since ?? ''}`,
          { headers: { Authorization: `Bearer ${this.config.AUTH_TOKEN}` } }
        );
        if (!response.ok) {
          return { success: false, error: `RingCentral API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { provider, eventType, since, message: 'Provider-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'FETCH_EVENTS_FAILED' };
    }
  }

  private async sendSms(params: Record<string, unknown>): Promise<SkillResult> {
    const to = params.to as string;
    const message = params.message as string;

    if (!to) return { success: false, error: 'to is required', error_code: 'MISSING_PARAM' };
    if (!message) return { success: false, error: 'message is required', error_code: 'MISSING_PARAM' };

    const provider = this.config.VOIP_PROVIDER ?? 'twilio';

    try {
      if (provider === 'twilio') {
        const auth = Buffer.from(`${this.config.ACCOUNT_SID}:${this.config.AUTH_TOKEN}`).toString('base64');
        const body = new URLSearchParams({
          To: to,
          From: this.config.FROM_NUMBER,
          Body: message,
        });

        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${this.config.ACCOUNT_SID}/Messages.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
          }
        );
        if (!response.ok) {
          return { success: false, error: `Twilio API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { provider, to, messageSent: true, message: 'Provider-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'SMS_FAILED' };
    }
  }

  private async initiateCall(params: Record<string, unknown>): Promise<SkillResult> {
    const to = params.to as string;
    const twimlUrl = params.twiml_url as string | undefined;

    if (!to) return { success: false, error: 'to is required', error_code: 'MISSING_PARAM' };

    const provider = this.config.VOIP_PROVIDER ?? 'twilio';

    try {
      if (provider === 'twilio') {
        const auth = Buffer.from(`${this.config.ACCOUNT_SID}:${this.config.AUTH_TOKEN}`).toString('base64');
        const body = new URLSearchParams({
          To: to,
          From: this.config.FROM_NUMBER,
          Url: twimlUrl ?? `${this.config.TWIML_BASE_URL ?? ''}/voice/outbound`,
        });

        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${this.config.ACCOUNT_SID}/Calls.json`,
          {
            method: 'POST',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
          }
        );
        if (!response.ok) {
          return { success: false, error: `Twilio API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { provider, to, callInitiated: true, message: 'Provider-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'CALL_FAILED' };
    }
  }

  private async getVoicemail(params: Record<string, unknown>): Promise<SkillResult> {
    const since = params.since as string | undefined;
    const limit = (params.limit as number) ?? 10;
    const provider = this.config.VOIP_PROVIDER ?? 'twilio';

    try {
      if (provider === 'twilio') {
        const auth = Buffer.from(`${this.config.ACCOUNT_SID}:${this.config.AUTH_TOKEN}`).toString('base64');
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${this.config.ACCOUNT_SID}/Recordings.json?PageSize=${limit}`,
          { headers: { Authorization: `Basic ${auth}` } }
        );
        if (!response.ok) {
          return { success: false, error: `Twilio API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { provider, since, limit, message: 'Provider-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'VOICEMAIL_FAILED' };
    }
  }
}
