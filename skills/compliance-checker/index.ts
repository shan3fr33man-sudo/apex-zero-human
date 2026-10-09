/**
 * Compliance Checker Skill — Built-in
 *
 * Validate operations against configurable regulatory rules.
 * Generic — supports any jurisdiction, rule set, and entity types via config.
 * Uses runtime-injected rules to check quotes, invoices, operations, and disclosures.
 *
 * Permissions: (none — fully offline, rules are embedded in config)
 * Config: RULES (JSON), JURISDICTION, ENTITY_TYPES, ALERT_THRESHOLD
 */

import type { ApexSkill, SkillResult } from '../../packages/shared/skill-interface.js';

export interface ComplianceRule {
  rule_id: string;
  name: string;
  description: string;
  entity_types: string[];
  severity: 'error' | 'warning' | 'info';
  check: Record<string, unknown>;
}

export interface ComplianceCheckContext {
  jurisdiction: string;
  entity_type: string;
  rules: ComplianceRule[];
}

export class ComplianceCheckerSkill implements ApexSkill {
  readonly name = 'compliance-checker';
  readonly version = '1.0.0';
  readonly permissions: string[] = [];
  readonly description = 'Validate operations against configurable regulatory rules';

  private config: Record<string, string> = {};
  private rules: ComplianceRule[] = [];
  private jurisdiction: string = '';
  private entityTypes: string[] = [];
  private alertThreshold: number = 80; // Score below this triggers alerts

  async initialize(config: Record<string, string>): Promise<void> {
    this.config = config;
    this.jurisdiction = config.JURISDICTION ?? 'US';
    this.alertThreshold = parseInt(config.ALERT_THRESHOLD ?? '80', 10);

    // Parse entity types
    if (config.ENTITY_TYPES) {
      this.entityTypes = config.ENTITY_TYPES.split(',').map((t) => t.trim());
    } else {
      this.entityTypes = ['quote', 'invoice', 'contract', 'disclosure'];
    }

    // Parse rules from config
    if (config.RULES) {
      try {
        const parsed = JSON.parse(config.RULES) as ComplianceRule[];
        this.rules = parsed;
      } catch {
        this.rules = this.getDefaultRules();
      }
    } else {
      this.rules = this.getDefaultRules();
    }
  }

  async execute(method: string, params: Record<string, unknown>): Promise<SkillResult> {
    switch (method) {
      case 'validateQuote':
        return this.validateQuote(params);
      case 'validateInvoice':
        return this.validateInvoice(params);
      case 'validateContract':
        return this.validateContract(params);
      case 'validateOperation':
        return this.validateOperation(params);
      case 'checkDisclosures':
        return this.checkDisclosures(params);
      case 'getRules':
        return this.getRules(params);
      case 'getComplianceScore':
        return this.getComplianceScore(params);
      default:
        return { success: false, error: `Unknown method: ${method}`, error_code: 'UNKNOWN_METHOD' };
    }
  }

  async shutdown(): Promise<void> {
    // No persistent resources
  }

  // --- Methods ---

  /**
   * Validate a quote against applicable compliance rules.
   */
  private async validateQuote(params: Record<string, unknown>): Promise<SkillResult> {
    const quote = params.quote as Record<string, unknown>;
    if (!quote) return { success: false, error: 'quote is required', error_code: 'MISSING_PARAM' };

    const violations: Array<{
      rule_id: string;
      rule_name: string;
      severity: string;
      message: string;
    }> = [];
    let complianceScore = 100;

    // Apply rules for quotes
    const applicableRules = this.rules.filter((r) => r.entity_types.includes('quote'));

    for (const rule of applicableRules) {
      const result = this.checkRule(rule, quote);
      if (!result.passed) {
        violations.push({
          rule_id: rule.rule_id,
          rule_name: rule.name,
          severity: rule.severity,
          message: result.message,
        });

        if (rule.severity === 'error') {
          complianceScore -= 25;
        } else if (rule.severity === 'warning') {
          complianceScore -= 10;
        }
      }
    }

    complianceScore = Math.max(0, complianceScore);

    return {
      success: violations.length === 0,
      data: {
        entity_type: 'quote',
        jurisdiction: this.jurisdiction,
        compliance_score: complianceScore,
        passed: violations.length === 0,
        violations,
        alert_triggered: complianceScore < this.alertThreshold,
        recommendations: violations.map((v) => this.getRecommendation(v.rule_id)),
      },
    };
  }

  /**
   * Validate an invoice against applicable compliance rules.
   */
  private async validateInvoice(params: Record<string, unknown>): Promise<SkillResult> {
    const invoice = params.invoice as Record<string, unknown>;
    if (!invoice) return { success: false, error: 'invoice is required', error_code: 'MISSING_PARAM' };

    const violations: Array<{
      rule_id: string;
      rule_name: string;
      severity: string;
      message: string;
    }> = [];
    let complianceScore = 100;

    // Apply rules for invoices
    const applicableRules = this.rules.filter((r) => r.entity_types.includes('invoice'));

    for (const rule of applicableRules) {
      const result = this.checkRule(rule, invoice);
      if (!result.passed) {
        violations.push({
          rule_id: rule.rule_id,
          rule_name: rule.name,
          severity: rule.severity,
          message: result.message,
        });

        if (rule.severity === 'error') {
          complianceScore -= 25;
        } else if (rule.severity === 'warning') {
          complianceScore -= 10;
        }
      }
    }

    complianceScore = Math.max(0, complianceScore);

    return {
      success: violations.length === 0,
      data: {
        entity_type: 'invoice',
        jurisdiction: this.jurisdiction,
        compliance_score: complianceScore,
        passed: violations.length === 0,
        violations,
        alert_triggered: complianceScore < this.alertThreshold,
        recommendations: violations.map((v) => this.getRecommendation(v.rule_id)),
      },
    };
  }

  /**
   * Validate a contract against applicable compliance rules.
   */
  private async validateContract(params: Record<string, unknown>): Promise<SkillResult> {
    const contract = params.contract as Record<string, unknown>;
    if (!contract) return { success: false, error: 'contract is required', error_code: 'MISSING_PARAM' };

    const violations: Array<{
      rule_id: string;
      rule_name: string;
      severity: string;
      message: string;
    }> = [];
    let complianceScore = 100;

    // Apply rules for contracts
    const applicableRules = this.rules.filter((r) => r.entity_types.includes('contract'));

    for (const rule of applicableRules) {
      const result = this.checkRule(rule, contract);
      if (!result.passed) {
        violations.push({
          rule_id: rule.rule_id,
          rule_name: rule.name,
          severity: rule.severity,
          message: result.message,
        });

        if (rule.severity === 'error') {
          complianceScore -= 25;
        } else if (rule.severity === 'warning') {
          complianceScore -= 10;
        }
      }
    }

    complianceScore = Math.max(0, complianceScore);

    return {
      success: violations.length === 0,
      data: {
        entity_type: 'contract',
        jurisdiction: this.jurisdiction,
        compliance_score: complianceScore,
        passed: violations.length === 0,
        violations,
        alert_triggered: complianceScore < this.alertThreshold,
        recommendations: violations.map((v) => this.getRecommendation(v.rule_id)),
      },
    };
  }

  /**
   * Generic operation validation for any entity type.
   */
  private async validateOperation(params: Record<string, unknown>): Promise<SkillResult> {
    const operation = params.operation as Record<string, unknown>;
    const entityType = (params.entity_type as string) ?? 'generic';

    if (!operation) return { success: false, error: 'operation is required', error_code: 'MISSING_PARAM' };

    const violations: Array<{
      rule_id: string;
      rule_name: string;
      severity: string;
      message: string;
    }> = [];
    let complianceScore = 100;

    // Apply rules that match this entity type
    const applicableRules = this.rules.filter(
      (r) => r.entity_types.includes(entityType) || r.entity_types.includes('*')
    );

    for (const rule of applicableRules) {
      const result = this.checkRule(rule, operation);
      if (!result.passed) {
        violations.push({
          rule_id: rule.rule_id,
          rule_name: rule.name,
          severity: rule.severity,
          message: result.message,
        });

        if (rule.severity === 'error') {
          complianceScore -= 25;
        } else if (rule.severity === 'warning') {
          complianceScore -= 10;
        }
      }
    }

    complianceScore = Math.max(0, complianceScore);

    return {
      success: violations.length === 0,
      data: {
        entity_type: entityType,
        jurisdiction: this.jurisdiction,
        compliance_score: complianceScore,
        passed: violations.length === 0,
        violations,
        alert_triggered: complianceScore < this.alertThreshold,
        recommendations: violations.map((v) => this.getRecommendation(v.rule_id)),
      },
    };
  }

  /**
   * Check if required disclosures are present.
   */
  private async checkDisclosures(params: Record<string, unknown>): Promise<SkillResult> {
    const entity = params.entity as Record<string, unknown>;
    const requiredDisclosures = (params.required_disclosures as string[]) ?? this.getDefaultDisclosures();

    if (!entity) return { success: false, error: 'entity is required', error_code: 'MISSING_PARAM' };

    const entityDisclosures = (entity.disclosures as string[]) ?? [];
    const missingDisclosures: string[] = [];

    for (const disclosure of requiredDisclosures) {
      if (!entityDisclosures.some((d) => d.includes(disclosure))) {
        missingDisclosures.push(disclosure);
      }
    }

    return {
      success: missingDisclosures.length === 0,
      data: {
        has_all_disclosures: missingDisclosures.length === 0,
        required_count: requiredDisclosures.length,
        present_count: entityDisclosures.length,
        missing_disclosures: missingDisclosures,
        full_disclosure_text: this.getDisclosureText(requiredDisclosures),
      },
    };
  }

  /**
   * Get all applicable rules for a jurisdiction.
   */
  private async getRules(params: Record<string, unknown>): Promise<SkillResult> {
    const entityType = params.entity_type as string | undefined;

    let applicableRules = this.rules;
    if (entityType) {
      applicableRules = this.rules.filter((r) => r.entity_types.includes(entityType));
    }

    return {
      success: true,
      data: {
        jurisdiction: this.jurisdiction,
        total_rules: this.rules.length,
        applicable_rules: applicableRules,
        entity_types: this.entityTypes,
      },
    };
  }

  /**
   * Calculate overall compliance score for an entity.
   */
  private async getComplianceScore(params: Record<string, unknown>): Promise<SkillResult> {
    const entity = params.entity as Record<string, unknown>;
    const entityType = (params.entity_type as string) ?? 'generic';

    if (!entity) return { success: false, error: 'entity is required', error_code: 'MISSING_PARAM' };

    let complianceScore = 100;
    const violations: string[] = [];

    const applicableRules = this.rules.filter(
      (r) => r.entity_types.includes(entityType) || r.entity_types.includes('*')
    );

    for (const rule of applicableRules) {
      const result = this.checkRule(rule, entity);
      if (!result.passed) {
        violations.push(rule.name);

        if (rule.severity === 'error') {
          complianceScore -= 25;
        } else if (rule.severity === 'warning') {
          complianceScore -= 10;
        }
      }
    }

    complianceScore = Math.max(0, complianceScore);

    return {
      success: true,
      data: {
        entity_type: entityType,
        compliance_score: complianceScore,
        is_compliant: complianceScore >= this.alertThreshold,
        violations_found: violations.length,
        violations,
        jurisdiction: this.jurisdiction,
      },
    };
  }

  // --- Private helpers ---

  /**
   * Check if an entity passes a specific rule.
   */
  private checkRule(
    rule: ComplianceRule,
    entity: Record<string, unknown>
  ): { passed: boolean; message: string } {
    const check = rule.check;

    // Check for required fields
    const requiredFields = check.required_fields as string[] | undefined;
    if (requiredFields) {
      for (const field of requiredFields) {
        if (!(field in entity) || entity[field] === null || entity[field] === undefined || entity[field] === '') {
          return { passed: false, message: `Missing required field: ${field}` };
        }
      }
    }

    // Check minimum values
    const minimumValues = check.minimum_values as Record<string, number> | undefined;
    if (minimumValues) {
      for (const [field, min] of Object.entries(minimumValues)) {
        const value = (entity[field] as number) ?? 0;
        if (value < min) {
          return { passed: false, message: `${field} must be at least ${min}, got ${value}` };
        }
      }
    }

    // Check maximum values
    const maximumValues = check.maximum_values as Record<string, number> | undefined;
    if (maximumValues) {
      for (const [field, max] of Object.entries(maximumValues)) {
        const value = (entity[field] as number) ?? 0;
        if (value > max) {
          return { passed: false, message: `${field} must not exceed ${max}, got ${value}` };
        }
      }
    }

    // Check allowed values
    const allowedValues = check.allowed_values as Record<string, string[]> | undefined;
    if (allowedValues) {
      for (const [field, allowed] of Object.entries(allowedValues)) {
        const value = entity[field] as string | undefined;
        if (value && !allowed.includes(value)) {
          return { passed: false, message: `${field} must be one of: ${allowed.join(', ')}` };
        }
      }
    }

    return { passed: true, message: 'Passed' };
  }

  /**
   * Get default compliance rules (WA UTC Tariff 15-C style).
   */
  private getDefaultRules(): ComplianceRule[] {
    return [
      {
        rule_id: 'MIN_CHARGE',
        name: 'Minimum Charge Requirement',
        description: 'Quote must meet minimum charge threshold',
        entity_types: ['quote'],
        severity: 'error',
        check: {
          minimum_values: { total: 150, hours: 2 },
        },
      },
      {
        rule_id: 'TRAVEL_TIME',
        name: 'Travel Time Disclosure',
        description: 'Travel time must be included and explicitly stated',
        entity_types: ['quote'],
        severity: 'error',
        check: {
          required_fields: ['includes_travel_time', 'travel_time_hours'],
        },
      },
      {
        rule_id: 'REQUIRED_DISCLOSURES',
        name: 'Consumer Disclosures',
        description: 'All required consumer protection disclosures must be present',
        entity_types: ['quote', 'contract'],
        severity: 'error',
        check: {
          required_fields: ['disclosures'],
        },
      },
      {
        rule_id: 'FUEL_SURCHARGE',
        name: 'Fuel Surcharge Disclosure',
        description: 'Fuel surcharge (if applicable) must be separately disclosed',
        entity_types: ['quote', 'invoice'],
        severity: 'warning',
        check: {
          required_fields: ['fuel_surcharge_disclosed'],
        },
      },
      {
        rule_id: 'WRITTEN_ESTIMATE',
        name: 'Written Estimate Requirement',
        description: 'Binding estimate must be provided in writing',
        entity_types: ['quote'],
        severity: 'error',
        check: {
          required_fields: ['binding_estimate', 'estimate_provided_date'],
        },
      },
      {
        rule_id: 'PAYMENT_TERMS',
        name: 'Payment Terms Disclosure',
        description: 'Payment terms and conditions must be clearly stated',
        entity_types: ['invoice', 'contract'],
        severity: 'error',
        check: {
          required_fields: ['payment_terms', 'due_date'],
        },
      },
      {
        rule_id: 'INVOICE_DETAILS',
        name: 'Invoice Detail Requirements',
        description: 'Invoice must include itemized services and labor rates',
        entity_types: ['invoice'],
        severity: 'error',
        check: {
          required_fields: ['itemized_services', 'labor_rate', 'total_labor_hours'],
        },
      },
    ];
  }

  /**
   * Get default required disclosures.
   */
  private getDefaultDisclosures(): string[] {
    return [
      'Your Rights as a Consumer of Moving Services',
      'The actual charges may vary from the estimate',
      'You have the right to inspect the mover\'s tariff',
      'Federal and state regulations protect you',
      'Contact information for regulatory body',
    ];
  }

  /**
   * Get a recommendation for fixing a rule violation.
   */
  private getRecommendation(ruleId: string): string {
    const recommendations: Record<string, string> = {
      MIN_CHARGE: 'Adjust pricing to meet minimum charge requirements (2 hours, $150 minimum)',
      TRAVEL_TIME: 'Add travel time as a separate line item with hours disclosed',
      REQUIRED_DISCLOSURES: 'Include all required consumer protection disclosures on the estimate',
      FUEL_SURCHARGE: 'Separately disclose any fuel surcharge percentage or amount',
      WRITTEN_ESTIMATE:
        'Provide a written binding estimate signed by the customer before service',
      PAYMENT_TERMS: 'Clearly state payment terms, methods accepted, and due date',
      INVOICE_DETAILS: 'Itemize all services, provide hourly rates, and list total hours worked',
    };
    return recommendations[ruleId] ?? 'Review this rule to ensure compliance';
  }

  /**
   * Generate full disclosure text for entity.
   */
  private getDisclosureText(disclosures: string[]): string {
    return disclosures.join('\n\n');
  }
}
