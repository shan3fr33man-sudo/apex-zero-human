/**
 * Review Requester Skill — Built-in
 *
 * Send post-service review requests via configured review platforms.
 * Generic — review platform, URL, delay, and templates come from config.
 *
 * Permissions: network.outbound, network.resend
 * Config: REVIEW_PLATFORM_PRIMARY, REVIEW_URL_PRIMARY, REVIEW_PLATFORM_SECONDARY,
 *         REVIEW_URL_SECONDARY, DELAY_HOURS
 */

import type { ApexSkill, SkillResult } from '../../packages/shared/skill-interface.js';

export class ReviewRequesterSkill implements ApexSkill {
  readonly name = 'review-requester';
  readonly version = '1.0.0';
  readonly permissions = ['network.outbound', 'network.resend'];
  readonly description = 'Send post-service review requests via configured review platforms';

  private config: Record<string, string> = {};

  async initialize(config: Record<string, string>): Promise<void> {
    this.config = config;
  }

  async execute(method: string, params: Record<string, unknown>): Promise<SkillResult> {
    switch (method) {
      case 'sendRequest':
        return this.sendRequest(params);
      case 'checkStatus':
        return this.checkStatus(params);
      case 'getReviewStats':
        return this.getReviewStats(params);
      default:
        return { success: false, error: `Unknown method: ${method}`, error_code: 'UNKNOWN_METHOD' };
    }
  }

  async shutdown(): Promise<void> {
    // No persistent resources
  }

  // --- Methods ---

  private async sendRequest(params: Record<string, unknown>): Promise<SkillResult> {
    const customerEmail = params.customer_email as string;
    const customerName = params.customer_name as string;
    const serviceDate = params.service_date as string;
    const platform = (params.platform as string) ?? 'primary';
    const companyName = params.company_name as string ?? 'our team';

    if (!customerEmail) return { success: false, error: 'customer_email is required', error_code: 'MISSING_PARAM' };
    if (!customerName) return { success: false, error: 'customer_name is required', error_code: 'MISSING_PARAM' };

    // Determine review URL from config
    const reviewUrl = platform === 'secondary'
      ? this.config.REVIEW_URL_SECONDARY
      : this.config.REVIEW_URL_PRIMARY;

    const reviewPlatform = platform === 'secondary'
      ? this.config.REVIEW_PLATFORM_SECONDARY
      : this.config.REVIEW_PLATFORM_PRIMARY;

    if (!reviewUrl) {
      return {
        success: false,
        error: `No review URL configured for ${platform} platform`,
        error_code: 'CONFIG_MISSING',
      };
    }

    // Build review request email
    const emailBody = this.buildReviewEmail(customerName, companyName, reviewUrl, reviewPlatform ?? 'review');

    try {
      // Send via configured email provider (Resend by default)
      const emailApiKey = this.config.EMAIL_API_KEY ?? this.config.API_KEY;
      const fromAddress = this.config.FROM_ADDRESS ?? `reviews@${companyName.toLowerCase().replace(/\s+/g, '')}.com`;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${emailApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: customerEmail,
          subject: `How was your experience with ${companyName}?`,
          html: emailBody,
        }),
      });

      if (!response.ok) {
        return { success: false, error: `Email API error: ${response.status}`, error_code: 'API_ERROR' };
      }

      const data = await response.json();
      return {
        success: true,
        data: {
          email_sent: true,
          to: customerEmail,
          platform: reviewPlatform,
          review_url: reviewUrl,
          email_id: (data as Record<string, unknown>).id,
        },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'SEND_REQUEST_FAILED' };
    }
  }

  private async checkStatus(params: Record<string, unknown>): Promise<SkillResult> {
    const customerEmail = params.customer_email as string;
    if (!customerEmail) return { success: false, error: 'customer_email is required', error_code: 'MISSING_PARAM' };

    // In production, this would check:
    // 1. Whether the review request email was opened
    // 2. Whether the review link was clicked
    // 3. Whether a review was actually left
    return {
      success: true,
      data: {
        customer_email: customerEmail,
        request_sent: true,
        email_opened: null, // Would come from email tracking
        link_clicked: null,
        review_left: null,
        message: 'Tracking data requires email provider webhook integration',
      },
    };
  }

  private async getReviewStats(params: Record<string, unknown>): Promise<SkillResult> {
    const period = (params.period as string) ?? 'last_30_days';

    // In production, this would aggregate:
    // 1. Total review requests sent
    // 2. Response rate
    // 3. Average rating
    // 4. Platform breakdown
    return {
      success: true,
      data: {
        period,
        primary_platform: this.config.REVIEW_PLATFORM_PRIMARY,
        secondary_platform: this.config.REVIEW_PLATFORM_SECONDARY ?? null,
        message: 'Full stats require review platform API integration',
      },
    };
  }

  // --- Helpers ---

  private buildReviewEmail(
    customerName: string,
    companyName: string,
    reviewUrl: string,
    platformName: string
  ): string {
    return `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Thank you, ${customerName}!</h2>
        <p>We hope you had a great experience with ${companyName}. Your feedback means the world to us and helps other customers make informed decisions.</p>
        <p>Would you mind taking a moment to share your experience?</p>
        <p style="text-align: center; margin: 30px 0;">
          <a href="${reviewUrl}" style="background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Leave a Review on ${platformName.charAt(0).toUpperCase() + platformName.slice(1)}
          </a>
        </p>
        <p style="color: #666; font-size: 14px;">Thank you for choosing ${companyName}. We appreciate your business!</p>
      </div>
    `;
  }
}
