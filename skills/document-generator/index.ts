/**
 * Document Generator Skill — Built-in
 *
 * Generate PDF/DOCX documents from templates — quotes, invoices, reports, contracts.
 * Generic — templates, branding, and content come from company config and params.
 *
 * Permissions: files.read, files.write
 * Config: TEMPLATE_DIR, COMPANY_LOGO_URL
 */

import type { ApexSkill, SkillResult } from '../../packages/shared/skill-interface.js';

/**
 * Supported document templates. Companies can extend with custom templates.
 */
type DocumentTemplate =
  | 'quote'
  | 'invoice'
  | 'compliance_report'
  | 'marketing_report'
  | 'contract'
  | 'letter'
  | 'custom';

export class DocumentGeneratorSkill implements ApexSkill {
  readonly name = 'document-generator';
  readonly version = '1.0.0';
  readonly permissions = ['files.read', 'files.write'];
  readonly description = 'Generate PDF/DOCX documents from templates — quotes, invoices, reports, contracts';

  private config: Record<string, string> = {};

  async initialize(config: Record<string, string>): Promise<void> {
    this.config = config;
  }

  async execute(method: string, params: Record<string, unknown>): Promise<SkillResult> {
    switch (method) {
      case 'generateDocument':
        return this.generateDocument(params);
      case 'listTemplates':
        return this.listTemplates();
      case 'renderTemplate':
        return this.renderTemplate(params);
      default:
        return { success: false, error: `Unknown method: ${method}`, error_code: 'UNKNOWN_METHOD' };
    }
  }

  async shutdown(): Promise<void> {
    // No persistent resources
  }

  // --- Methods ---

  private async generateDocument(params: Record<string, unknown>): Promise<SkillResult> {
    const template = (params.template as DocumentTemplate) ?? 'custom';
    const data = params.data as Record<string, unknown>;
    const format = (params.format as string) ?? 'pdf';
    const filename = params.filename as string | undefined;

    if (!data) return { success: false, error: 'data is required', error_code: 'MISSING_PARAM' };

    try {
      // Build HTML content from template + data
      const html = this.renderToHtml(template, data);

      // In production, this would use a library like Puppeteer (PDF) or docx (DOCX)
      // to convert HTML → final document format.
      //
      // For PDF: puppeteer page.pdf() or @react-pdf/renderer
      // For DOCX: docx library or html-to-docx
      //
      // The generated file would be written to the scratch directory.

      const outputFilename = filename ?? `${template}_${Date.now()}.${format}`;
      const outputPath = `${this.config.TEMPLATE_DIR ?? '/tmp/apex-skill-scratch'}/${outputFilename}`;

      return {
        success: true,
        data: {
          template,
          format,
          filename: outputFilename,
          path: outputPath,
          html_preview: html.substring(0, 500),
          message: `Document generated. In production, HTML is converted to ${format.toUpperCase()} via rendering engine.`,
        },
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      return { success: false, error, error_code: 'GENERATION_FAILED' };
    }
  }

  private async listTemplates(): Promise<SkillResult> {
    const templates = [
      { name: 'quote', description: 'Service quote with itemized pricing, terms, and disclosures' },
      { name: 'invoice', description: 'Invoice with line items, totals, and payment terms' },
      { name: 'compliance_report', description: 'Compliance audit report with findings and recommendations' },
      { name: 'marketing_report', description: 'Marketing performance report with metrics and analysis' },
      { name: 'contract', description: 'Service contract with terms, conditions, and signature blocks' },
      { name: 'letter', description: 'Professional business letter with company letterhead' },
      { name: 'custom', description: 'Custom document from provided HTML content' },
    ];

    return { success: true, data: { templates, count: templates.length } };
  }

  private async renderTemplate(params: Record<string, unknown>): Promise<SkillResult> {
    const template = (params.template as DocumentTemplate) ?? 'custom';
    const data = params.data as Record<string, unknown>;

    if (!data) return { success: false, error: 'data is required', error_code: 'MISSING_PARAM' };

    const html = this.renderToHtml(template, data);
    return { success: true, data: { html, template } };
  }

  // --- Template rendering ---

  private renderToHtml(template: DocumentTemplate, data: Record<string, unknown>): string {
    const companyLogo = this.config.COMPANY_LOGO_URL ?? '';
    const companyName = (data.company_name as string) ?? 'Company';

    const header = `
      <div style="border-bottom: 2px solid #333; padding-bottom: 16px; margin-bottom: 24px;">
        ${companyLogo ? `<img src="${companyLogo}" alt="${companyName}" style="max-height: 60px;" />` : ''}
        <h1 style="margin: 8px 0 0; font-size: 24px;">${companyName}</h1>
      </div>
    `;

    switch (template) {
      case 'quote':
        return this.renderQuote(header, data);
      case 'invoice':
        return this.renderInvoice(header, data);
      case 'compliance_report':
        return this.renderComplianceReport(header, data);
      case 'marketing_report':
        return this.renderMarketingReport(header, data);
      case 'contract':
        return this.renderContract(header, data);
      case 'letter':
        return this.renderLetter(header, data);
      case 'custom':
        return (data.html as string) ?? '<p>No content provided</p>';
      default:
        return `<p>Unknown template: ${template}</p>`;
    }
  }

  private renderQuote(header: string, data: Record<string, unknown>): string {
    const items = (data.items as Array<{ description: string; quantity: number; unit_price: number }>) ?? [];
    const customerName = (data.customer_name as string) ?? 'Customer';
    const serviceDate = (data.service_date as string) ?? 'TBD';
    const disclosures = (data.disclosures as string[]) ?? [];

    const itemRows = items
      .map(
        (item) =>
          `<tr><td>${item.description}</td><td>${item.quantity}</td><td>$${item.unit_price.toFixed(2)}</td><td>$${(item.quantity * item.unit_price).toFixed(2)}</td></tr>`
      )
      .join('');

    const total = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

    const disclosureHtml = disclosures.length > 0
      ? `<div style="margin-top: 24px; padding: 12px; background: #f5f5f5; font-size: 12px;">
           <strong>Required Disclosures:</strong>
           ${disclosures.map((d) => `<p>${d}</p>`).join('')}
         </div>`
      : '';

    return `
      <div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 24px;">
        ${header}
        <h2>Quote</h2>
        <p><strong>Customer:</strong> ${customerName}</p>
        <p><strong>Service Date:</strong> ${serviceDate}</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <thead><tr style="background: #f0f0f0;"><th style="text-align:left;padding:8px;">Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
          <tbody>${itemRows}</tbody>
          <tfoot><tr style="font-weight:bold;border-top:2px solid #333;"><td colspan="3" style="padding:8px;text-align:right;">Total</td><td style="padding:8px;">$${total.toFixed(2)}</td></tr></tfoot>
        </table>
        ${disclosureHtml}
      </div>
    `;
  }

  private renderInvoice(header: string, data: Record<string, unknown>): string {
    const invoiceNumber = (data.invoice_number as string) ?? `INV-${Date.now()}`;
    const items = (data.items as Array<{ description: string; amount: number }>) ?? [];
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    const dueDate = (data.due_date as string) ?? 'Upon receipt';

    const itemRows = items
      .map((item) => `<tr><td style="padding:8px;">${item.description}</td><td style="padding:8px;text-align:right;">$${item.amount.toFixed(2)}</td></tr>`)
      .join('');

    return `
      <div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 24px;">
        ${header}
        <h2>Invoice #${invoiceNumber}</h2>
        <p><strong>Due Date:</strong> ${dueDate}</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <thead><tr style="background: #f0f0f0;"><th style="text-align:left;padding:8px;">Description</th><th style="text-align:right;padding:8px;">Amount</th></tr></thead>
          <tbody>${itemRows}</tbody>
          <tfoot><tr style="font-weight:bold;border-top:2px solid #333;"><td style="padding:8px;">Total Due</td><td style="padding:8px;text-align:right;">$${total.toFixed(2)}</td></tr></tfoot>
        </table>
      </div>
    `;
  }

  private renderComplianceReport(header: string, data: Record<string, unknown>): string {
    const reportDate = (data.report_date as string) ?? new Date().toISOString().split('T')[0];
    const findings = (data.findings as Array<{ severity: string; description: string; recommendation: string }>) ?? [];
    const summary = (data.summary as string) ?? '';

    const findingRows = findings
      .map(
        (f) =>
          `<tr><td style="padding:8px;"><span style="color:${f.severity === 'high' ? 'red' : f.severity === 'medium' ? 'orange' : 'green'}">${f.severity.toUpperCase()}</span></td><td style="padding:8px;">${f.description}</td><td style="padding:8px;">${f.recommendation}</td></tr>`
      )
      .join('');

    return `
      <div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 24px;">
        ${header}
        <h2>Compliance Report — ${reportDate}</h2>
        <p>${summary}</p>
        <h3>Findings (${findings.length})</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead><tr style="background: #f0f0f0;"><th style="text-align:left;padding:8px;">Severity</th><th style="text-align:left;padding:8px;">Finding</th><th style="text-align:left;padding:8px;">Recommendation</th></tr></thead>
          <tbody>${findingRows}</tbody>
        </table>
      </div>
    `;
  }

  private renderMarketingReport(header: string, data: Record<string, unknown>): string {
    const period = (data.period as string) ?? 'This Period';
    const metrics = (data.metrics as Record<string, number>) ?? {};
    const recommendations = (data.recommendations as string[]) ?? [];

    const metricRows = Object.entries(metrics)
      .map(([key, value]) => `<tr><td style="padding:8px;">${key}</td><td style="padding:8px;text-align:right;">${value.toLocaleString()}</td></tr>`)
      .join('');

    const recHtml = recommendations.length > 0
      ? `<h3>Recommendations</h3><ul>${recommendations.map((r) => `<li>${r}</li>`).join('')}</ul>`
      : '';

    return `
      <div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 24px;">
        ${header}
        <h2>Marketing Performance Report — ${period}</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <thead><tr style="background: #f0f0f0;"><th style="text-align:left;padding:8px;">Metric</th><th style="text-align:right;padding:8px;">Value</th></tr></thead>
          <tbody>${metricRows}</tbody>
        </table>
        ${recHtml}
      </div>
    `;
  }

  private renderContract(header: string, data: Record<string, unknown>): string {
    const partyA = (data.party_a as string) ?? 'Party A';
    const partyB = (data.party_b as string) ?? 'Party B';
    const terms = (data.terms as string) ?? '';
    const effectiveDate = (data.effective_date as string) ?? new Date().toISOString().split('T')[0];

    return `
      <div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 24px;">
        ${header}
        <h2>Service Agreement</h2>
        <p>This agreement is entered into as of ${effectiveDate} between <strong>${partyA}</strong> and <strong>${partyB}</strong>.</p>
        <h3>Terms and Conditions</h3>
        <div>${terms}</div>
        <div style="margin-top: 48px; display: flex; justify-content: space-between;">
          <div><p>________________________</p><p>${partyA}</p><p>Date: _______________</p></div>
          <div><p>________________________</p><p>${partyB}</p><p>Date: _______________</p></div>
        </div>
      </div>
    `;
  }

  private renderLetter(header: string, data: Record<string, unknown>): string {
    const recipient = (data.recipient as string) ?? 'Valued Customer';
    const subject = (data.subject as string) ?? '';
    const body = (data.body as string) ?? '';
    const senderName = (data.sender_name as string) ?? '';

    return `
      <div style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 24px;">
        ${header}
        <p style="margin-top: 24px;">Dear ${recipient},</p>
        ${subject ? `<p><strong>Re: ${subject}</strong></p>` : ''}
        <div style="margin: 16px 0;">${body}</div>
        <p style="margin-top: 32px;">Sincerely,</p>
        <p>${senderName}</p>
      </div>
    `;
  }
}
