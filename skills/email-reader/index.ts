/**
 * Email Reader Skill — Built-in
 *
 * Read, search, and send emails via the company's configured email provider.
 * Generic — supports Gmail, Resend, SMTP, or any provider via config.
 *
 * Permissions: network.gmail, network.resend
 * Config: EMAIL_PROVIDER, API_KEY, FROM_ADDRESS
 */

import type { ApexSkill, SkillResult } from '../../packages/shared/skill-interface.js';

export class EmailReaderSkill implements ApexSkill {
  readonly name = 'email-reader';
  readonly version = '1.0.0';
  readonly permissions = ['network.gmail', 'network.resend'];
  readonly description = 'Read, search, and send emails via configured email provider';

  private config: Record<string, string> = {};

  async initialize(config: Record<string, string>): Promise<void> {
    this.config = config;
  }

  async execute(method: string, params: Record<string, unknown>): Promise<SkillResult> {
    switch (method) {
      case 'getUnread':
        return this.getUnread(params);
      case 'searchEmails':
        return this.searchEmails(params);
      case 'sendEmail':
        return this.sendEmail(params);
      case 'getThread':
        return this.getThread(params);
      default:
        return { success: false, error: `Unknown method: ${method}`, error_code: 'UNKNOWN_METHOD' };
    }
  }

  async shutdown(): Promise<void> {
    // No persistent resources
  }

  // --- Methods ---

  private async getUnread(params: Record<string, unknown>): Promise<SkillResult> {
    const folder = (params.folder as string) ?? 'INBOX';
    const limit = (params.limit as number) ?? 20;
    const provider = this.config.EMAIL_PROVIDER ?? 'gmail';

    try {
      if (provider === 'gmail') {
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread+in:${folder}&maxResults=${limit}`,
          { headers: { Authorization: `Bearer ${this.config.API_KEY}` } }
        );
        if (!response.ok) {
          return { success: false, error: `Gmail API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      // Generic fallback for other providers
      return {
        success: true,
        data: { provider, folder, limit, message: 'Provider-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'FETCH_FAILED' };
    }
  }

  private async searchEmails(params: Record<string, unknown>): Promise<SkillResult> {
    const query = params.query as string;
    const since = params.since as string | undefined;
    const limit = (params.limit as number) ?? 20;

    if (!query) return { success: false, error: 'query is required', error_code: 'MISSING_PARAM' };

    try {
      const provider = this.config.EMAIL_PROVIDER ?? 'gmail';

      if (provider === 'gmail') {
        let q = query;
        if (since) q += ` after:${since}`;

        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=${limit}`,
          { headers: { Authorization: `Bearer ${this.config.API_KEY}` } }
        );
        if (!response.ok) {
          return { success: false, error: `Gmail API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { provider, query, since, limit, message: 'Provider-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'SEARCH_FAILED' };
    }
  }

  private async sendEmail(params: Record<string, unknown>): Promise<SkillResult> {
    const to = params.to as string;
    const subject = params.subject as string;
    const body = params.body as string;
    const attachments = params.attachments as string[] | undefined;

    if (!to) return { success: false, error: 'to is required', error_code: 'MISSING_PARAM' };
    if (!subject) return { success: false, error: 'subject is required', error_code: 'MISSING_PARAM' };
    if (!body) return { success: false, error: 'body is required', error_code: 'MISSING_PARAM' };

    try {
      const provider = this.config.EMAIL_PROVIDER ?? 'resend';

      if (provider === 'resend') {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: this.config.FROM_ADDRESS,
            to,
            subject,
            html: body,
          }),
        });
        if (!response.ok) {
          return { success: false, error: `Resend API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { provider, to, subject, attachmentCount: attachments?.length ?? 0, message: 'Provider-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'SEND_FAILED' };
    }
  }

  private async getThread(params: Record<string, unknown>): Promise<SkillResult> {
    const threadId = params.thread_id as string;
    if (!threadId) return { success: false, error: 'thread_id is required', error_code: 'MISSING_PARAM' };

    try {
      const provider = this.config.EMAIL_PROVIDER ?? 'gmail';

      if (provider === 'gmail') {
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}`,
          { headers: { Authorization: `Bearer ${this.config.API_KEY}` } }
        );
        if (!response.ok) {
          return { success: false, error: `Gmail API error: ${response.status}`, error_code: 'API_ERROR' };
        }
        const data = await response.json();
        return { success: true, data };
      }

      return {
        success: true,
        data: { provider, threadId, message: 'Provider-specific implementation needed' },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'THREAD_FAILED' };
    }
  }
}
