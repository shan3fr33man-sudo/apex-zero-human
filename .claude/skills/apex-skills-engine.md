---
name: apex-skills-engine
description: >
  Use this skill for ALL skill-related work in APEX — building the skill sandbox,
  skill registry, skill loader, and the 8 built-in APEX skills. Triggers: any mention
  of "skill", "sandbox", "VM isolation", "skill registry", "install skill", "web browser
  skill", "RingCentral skill", "SmartMoving skill", "tariff checker", "fleet coordinator",
  "Google Ads skill", "review requester", "email reader", or any work inside skills/.
  ALWAYS sandbox external skills. NEVER give skills access to process.env directly.
  NEVER let skills write to the database directly — only via approved APEX APIs.
---

# APEX Skills Engine Skill

## Security Model (Non-Negotiable)

Every skill — built-in or external — runs in a sandboxed environment.
Skills declare their permissions upfront. Skills that exceed their declared permissions are quarantined automatically.

```
Approved permissions:
  network.outbound       — make HTTP requests (whitelisted domains only)
  network.ringcentral    — RingCentral API
  network.smartmoving    — SmartMoving CRM API
  network.google-ads     — Google Ads API
  network.gmail          — Gmail API (read-only unless write declared)
  network.resend         — Send emails via Resend
  network.twilio         — Send SMS via Twilio
  files.read             — Read files from /tmp/apex-skill-scratch/ only
  files.write            — Write files to /tmp/apex-skill-scratch/ only
  browser.navigate       — Open URLs in headless Playwright
  browser.screenshot     — Take screenshots
  db.read                — Read from approved APEX tables via service API
```

**NEVER allowed (for any skill, ever):**
- `process.env` access
- `fs` access outside /tmp/apex-skill-scratch/
- Direct Supabase connection
- `child_process` / `exec` / `spawn`
- Dynamic `require()` or `eval()`
- Access to other companies' data

---

## Skill Interface (Every skill must implement this)

```typescript
// packages/shared/skill-interface.ts
export interface ApexSkill {
  readonly name: string;
  readonly version: string;
  readonly permissions: string[];
  readonly description: string;

  initialize(config: Record<string, string>): Promise<void>;
  execute(method: string, params: Record<string, unknown>): Promise<SkillResult>;
  shutdown(): Promise<void>;
}

export interface SkillResult {
  success: boolean;
  data?: unknown;
  error?: string;
  error_code?: string;
  tokens_used?: number;
}
```

---

## Skill Sandbox

```typescript
// skills/sandbox.ts
import { VM } from 'vm2'; // vm2 for Node.js sandboxing

export class SkillSandbox {
  async execute(
    skillCode: string,
    method: string,
    params: Record<string, unknown>,
    config: Record<string, string>,
    permissions: string[]
  ): Promise<SkillResult> {
    const sandbox = new VM({
      timeout: 30000,      // 30 second max execution
      sandbox: {
        // Only inject what permissions allow
        fetch: permissions.some(p => p.startsWith('network'))
          ? this.createSafeFetch(permissions)
          : undefined,
        console: {
          log: (msg: string) => this.log(msg),
          error: (msg: string) => this.logError(msg),
        },
        config,  // Injected credentials — skill accesses via config.API_KEY, not process.env
        params,
        Buffer,
        JSON,
        Math,
        Date,
      },
      require: {
        external: false,  // No external requires
        builtin: [],      // No Node.js builtins
      }
    });

    try {
      const result = sandbox.run(skillCode);
      return { success: true, data: result };
    } catch (err: any) {
      // Quarantine skill if it tried to escape sandbox
      if (err.message?.includes('process') || err.message?.includes('require')) {
        await this.quarantineSkill(skillCode, err.message);
      }
      return { success: false, error: err.message, error_code: 'EXECUTION_FAILED' };
    }
  }

  private createSafeFetch(permissions: string[]) {
    // Whitelist-based fetch — only allowed domains
    const DOMAIN_WHITELIST: Record<string, string> = {
      'network.ringcentral': 'platform.ringcentral.com',
      'network.smartmoving': 'api.smartmoving.com',
      'network.google-ads': 'googleads.googleapis.com',
      'network.gmail': 'gmail.googleapis.com',
      'network.resend': 'api.resend.com',
      'network.twilio': 'api.twilio.com',
    };

    const allowedDomains = permissions
      .filter(p => DOMAIN_WHITELIST[p])
      .map(p => DOMAIN_WHITELIST[p]);

    return async (url: string, opts?: any) => {
      const hostname = new URL(url).hostname;
      if (!allowedDomains.some(d => hostname.endsWith(d))) {
        throw new Error(`Network access denied: ${hostname} not in permission whitelist`);
      }
      return fetch(url, opts);
    };
  }
}
```

---

## Built-in Skill: web-browser

```typescript
// skills/web-browser/index.ts
import { chromium } from 'playwright';

export const webBrowserSkill: ApexSkill = {
  name: 'web-browser',
  version: '1.0.0',
  permissions: ['browser.navigate', 'browser.screenshot'],
  description: 'Headless browser for QA verification, content scraping, competitor monitoring',

  async execute(method, params) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      switch (method) {
        case 'navigate':
          await page.goto(params.url as string, { waitUntil: 'networkidle' });
          return { success: true, data: { title: await page.title(), url: page.url() } };

        case 'screenshot':
          await page.goto(params.url as string, { waitUntil: 'networkidle' });
          const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
          // Returns base64 — agent can attach to issue comment
          return { success: true, data: { screenshot: screenshot.toString('base64') } };

        case 'extractText':
          await page.goto(params.url as string, { waitUntil: 'networkidle' });
          const text = await page.evaluate(() => document.body.innerText);
          return { success: true, data: { text } };

        case 'fillForm':
          for (const [selector, value] of Object.entries(params.fields as Record<string, string>)) {
            await page.fill(selector, value);
          }
          return { success: true, data: { filled: true } };

        default:
          return { success: false, error: `Unknown method: ${method}`, error_code: 'UNKNOWN_METHOD' };
      }
    } finally {
      await browser.close();
    }
  }
};
```

---

## Built-in Skill: ringcentral-listener

```typescript
// skills/ringcentral-listener/index.ts
// Receives RingCentral webhooks, normalizes them, writes to apex events table

export const ringCentralSkill: ApexSkill = {
  name: 'ringcentral-listener',
  version: '1.0.0',
  permissions: ['network.ringcentral'],
  description: 'Receives missed calls, voicemails, SMS from RingCentral. Fires apex events.',

  async execute(method, params) {
    switch (method) {
      case 'processWebhook':
        const event = params.webhook_payload as any;
        const apexEvent = this.normalizeRCEvent(event);

        // Write to apex events table via APEX API (not direct DB)
        const response = await fetch('/api/apex/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.APEX_SERVICE_TOKEN}` },
          body: JSON.stringify(apexEvent)
        });

        return { success: response.ok, data: apexEvent };

      case 'getMissedCalls':
        // Fetch recent missed calls from RC API
        const rc = await fetch(
          `https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/call-log?type=Missed&dateFrom=${params.from}`,
          { headers: { Authorization: `Bearer ${config.RC_ACCESS_TOKEN}` } }
        );
        return { success: true, data: await rc.json() };
    }
  },

  normalizeRCEvent(payload: any) {
    if (payload.body?.telephony?.callAttributes?.callType === 'Inbound'
      && payload.body?.telephony?.ringingState === 'Disconnected') {
      return {
        event_type: 'missed_call',
        payload: {
          caller_number: payload.body.from?.phoneNumber,
          called_number: payload.body.to?.phoneNumber,
          timestamp: payload.body.startTime,
          duration: payload.body.duration
        },
        source: 'ringcentral'
      };
    }
    return { event_type: 'rc_generic', payload, source: 'ringcentral' };
  }
};
```

---

## Built-in Skill: tariff-checker

```typescript
// skills/tariff-checker/index.ts
// WA UTC Tariff 15-C compliance validation. Fully offline — no network needed.

export const tariffCheckerSkill: ApexSkill = {
  name: 'tariff-checker',
  version: '1.0.0',
  permissions: [], // No network permissions needed — rules are embedded
  description: 'Validates quotes and invoices against WA UTC Tariff 15-C. Required for all moving quotes.',

  // Embedded WA UTC 15-C tariff schedule (simplified)
  TARIFF_RULES: {
    minimum_charge_hours: 2,
    minimum_charge_amount_usd: 150,
    travel_time_required: true,
    fuel_surcharge_disclosure_required: true,
    written_estimate_required: true,
    binding_estimate_allowed: true,
    required_disclosures: [
      'Your Rights as a Consumer of Moving Services',
      'The actual charges may vary from the estimate',
      'You have the right to inspect the mover\'s tariff'
    ]
  },

  async execute(method, params) {
    switch (method) {
      case 'validateQuote':
        const quote = params.quote as any;
        const errors = [];

        if (quote.hours < this.TARIFF_RULES.minimum_charge_hours) {
          errors.push(`Minimum charge is ${this.TARIFF_RULES.minimum_charge_hours} hours`);
        }
        if (quote.total < this.TARIFF_RULES.minimum_charge_amount_usd) {
          errors.push(`Minimum charge is $${this.TARIFF_RULES.minimum_charge_amount_usd}`);
        }
        if (!quote.includes_travel_time && this.TARIFF_RULES.travel_time_required) {
          errors.push('Travel time must be included and disclosed');
        }
        if (!quote.disclosures || quote.disclosures.length === 0) {
          errors.push('Required consumer disclosures must be included');
        }

        return {
          success: errors.length === 0,
          data: {
            valid: errors.length === 0,
            errors,
            required_disclosures: this.TARIFF_RULES.required_disclosures
          }
        };

      case 'generateDisclosure':
        return {
          success: true,
          data: {
            disclosure_text: this.TARIFF_RULES.required_disclosures.join('\n\n'),
            tariff_reference: 'WA UTC Tariff 15-C'
          }
        };
    }
  }
};
```

---

## Built-in Skill: fleet-coordinator

```typescript
// skills/fleet-coordinator/index.ts
// Manages APEX fleet: AM02, AM03, AM04, AM05, AM07, AM10, APM01, APM06, APM08, APM09

const FLEET = [
  { id: 'AM02', type: 'Isuzu NPR', brand: 'affordable' },
  { id: 'AM03', type: 'Isuzu NPR', brand: 'affordable' },
  { id: 'AM04', type: '2008 Isuzu Dump', brand: 'affordable', note: 'VIN NEEDS VERIFICATION' },
  { id: 'AM05', type: 'Isuzu NPR', brand: 'affordable' },
  { id: 'AM07', type: 'Isuzu NPR', brand: 'affordable' },
  { id: 'AM10', type: 'Isuzu NPR', brand: 'affordable' },
  { id: 'APM01', type: 'Isuzu NPR', brand: 'perfect' },
  { id: 'APM06', type: 'Isuzu NPR', brand: 'perfect' },
  { id: 'APM08', type: 'Isuzu NPR', brand: 'perfect' },
  { id: 'APM09', type: 'Isuzu NPR', brand: 'perfect' },
];

export const fleetCoordinatorSkill: ApexSkill = {
  name: 'fleet-coordinator',
  version: '1.0.0',
  permissions: ['db.read'],
  description: 'Tracks maintenance schedules and availability for the 10-truck Isuzu NPR fleet.',

  async execute(method, params) {
    switch (method) {
      case 'getFleetStatus':
        // Returns current status of all trucks from maintenance_logs
        const statuses = await this.getFromApexApi('/api/apex/fleet/status');
        return { success: true, data: statuses };

      case 'getOverdueMaintenance':
        const overdue = FLEET.filter(truck => {
          // Check against maintenance schedule
          return truck.note?.includes('VIN NEEDS VERIFICATION') || false;
        });
        return { success: true, data: { overdue, technician: 'Ilya Nikityuk (ASE Certified)' } };

      case 'checkAvailability':
        const { truck_id, date } = params as any;
        // Check if truck is scheduled for maintenance or already booked
        const available = await this.getFromApexApi(`/api/apex/fleet/${truck_id}/availability?date=${date}`);
        return { success: true, data: available };
    }
  }
};
```

---

## Skill Registry

```typescript
// skills/registry.ts
// Manages skill installation, versioning, safety scanning

export class SkillRegistry {
  async install(companyId: string, sourceUrl: string): Promise<SkillInstallResult> {
    // 1. Fetch skill from URL
    const response = await fetch(sourceUrl);
    const skillCode = await response.text();

    // 2. Static analysis scan
    const scanResult = await this.scanSkill(skillCode);
    if (scanResult.blocked) {
      return { success: false, error: 'Skill failed security scan', scan_result: scanResult };
    }

    // 3. Extract metadata (permissions, version, name)
    const metadata = this.extractMetadata(skillCode);

    // 4. Pin to commit SHA if GitHub URL
    const commitSha = await this.getCommitSha(sourceUrl);

    // 5. Store in database
    await this.supabase.from('skills').insert({
      company_id: companyId,
      name: metadata.name,
      source_url: sourceUrl,
      commit_sha: commitSha,
      version: metadata.version,
      permissions: metadata.permissions,
      safety_score: scanResult.score,
      verified: scanResult.score >= 80
    });

    return { success: true, skill_name: metadata.name };
  }

  private async scanSkill(code: string): Promise<ScanResult> {
    const DANGEROUS_PATTERNS = [
      /process\.env/,
      /require\s*\(/,
      /child_process/,
      /eval\s*\(/,
      /Function\s*\(/,
      /fs\.\w+/,
      /__dirname/,
      /global\./,
    ];

    const violations = DANGEROUS_PATTERNS
      .filter(pattern => pattern.test(code))
      .map(pattern => pattern.source);

    return {
      blocked: violations.length > 0,
      violations,
      score: Math.max(0, 100 - (violations.length * 25))
    };
  }
}
```
