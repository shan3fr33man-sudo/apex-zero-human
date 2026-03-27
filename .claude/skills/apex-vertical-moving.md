---
name: apex-vertical-moving
description: >
  Use this skill for ALL moving company vertical work — the pre-built agent template,
  moving-specific routines, WA UTC 15-C compliance, SmartMoving CRM integration,
  RingCentral call tracking, fleet management for A Perfect Mover and Affordable Movers LLC,
  and all moving-industry-specific business logic. Triggers: any mention of "moving company",
  "A Perfect Mover", "Affordable Movers", "mover", "dispatch", "lead recovery", "missed call",
  "tariff", "UTC 15-C", "fleet", "NPR truck", "SmartMoving", "RingCentral", or any
  industry-specific moving business logic. This is the first APEX vertical template.
---

# APEX Moving Company Vertical Skill

## Business Context

**Companies:** A Perfect Mover + Affordable Movers LLC
**Location:** Everett / Marysville, Washington State
**Owner:** Shane
**Compliance:** WA UTC Tariff 15-C (mandatory for all WA intrastate moves)
**CRM:** SmartMoving
**Phone:** RingCentral
**Fleet:** 10 trucks — AM02, AM03, AM04, AM05, AM07, AM10, APM01, APM06, APM08, APM09

---

## Template File Structure

```
templates/moving-company/
├── template.json
├── agents/
│   ├── ceo.md
│   ├── dispatch.md
│   ├── lead-recovery.md
│   ├── quote.md
│   ├── compliance.md
│   ├── fleet.md
│   ├── review-requester.md
│   ├── marketing.md
│   └── eval-engineer.md
├── routines/
│   ├── daily-briefing.json
│   ├── missed-call-recovery.json
│   ├── review-request-24h.json
│   ├── weekly-tariff-audit.json
│   ├── fleet-maintenance-check.json
│   └── ad-performance-report.json
└── README.md
```

---

## template.json

```json
{
  "id": "moving-company-v1",
  "name": "Moving Company Operations",
  "description": "Complete AI agent organization for a moving company.",
  "industry": "moving",
  "version": "1.0.0",
  "agents": [
    {
      "role": "CEO",
      "name": "Executive Director",
      "model_tier": "STRATEGIC",
      "persona_file": "agents/ceo.md",
      "reports_to": null,
      "installed_skills": [],
      "routines": ["daily-briefing"]
    },
    {
      "role": "Dispatch Agent",
      "name": "Dispatch",
      "model_tier": "TECHNICAL",
      "persona_file": "agents/dispatch.md",
      "reports_to": "CEO",
      "installed_skills": ["smartmoving-sync", "fleet-coordinator"],
      "routines": []
    },
    {
      "role": "Lead Recovery Agent",
      "name": "Lead Recovery",
      "model_tier": "TECHNICAL",
      "persona_file": "agents/lead-recovery.md",
      "reports_to": "CEO",
      "installed_skills": ["ringcentral-listener", "email-reader", "smartmoving-sync"],
      "routines": ["missed-call-recovery"]
    },
    {
      "role": "Quote Agent",
      "name": "Quoting",
      "model_tier": "ROUTINE",
      "persona_file": "agents/quote.md",
      "reports_to": "CEO",
      "installed_skills": ["tariff-checker", "smartmoving-sync"],
      "routines": []
    },
    {
      "role": "Compliance Agent",
      "name": "Compliance",
      "model_tier": "TECHNICAL",
      "persona_file": "agents/compliance.md",
      "reports_to": "CEO",
      "installed_skills": ["tariff-checker"],
      "routines": ["weekly-tariff-audit"]
    },
    {
      "role": "Fleet Coordinator",
      "name": "Fleet",
      "model_tier": "ROUTINE",
      "persona_file": "agents/fleet.md",
      "reports_to": "CEO",
      "installed_skills": ["fleet-coordinator"],
      "routines": ["fleet-maintenance-check"]
    },
    {
      "role": "Review Request Agent",
      "name": "Reviews",
      "model_tier": "ROUTINE",
      "persona_file": "agents/review-requester.md",
      "reports_to": "CEO",
      "installed_skills": ["email-reader", "review-requester"],
      "routines": ["review-request-24h"]
    },
    {
      "role": "Marketing Agent",
      "name": "Marketing",
      "model_tier": "TECHNICAL",
      "persona_file": "agents/marketing.md",
      "reports_to": "CEO",
      "installed_skills": ["google-ads-manager", "social-poster", "web-browser"],
      "routines": ["ad-performance-report"]
    },
    {
      "role": "Eval Engineer",
      "name": "Performance Review",
      "model_tier": "STRATEGIC",
      "persona_file": "agents/eval-engineer.md",
      "reports_to": "CEO",
      "installed_skills": [],
      "routines": ["weekly-eval-run"]
    }
  ],
  "reactive_events": [
    { "event_type": "missed_call", "agent_role": "Lead Recovery Agent" },
    { "event_type": "quote_requested", "agent_role": "Quote Agent" },
    { "event_type": "job_completed", "agent_role": "Review Request Agent" },
    { "event_type": "new_booking", "agent_role": "Dispatch Agent" },
    { "event_type": "cancellation", "agent_role": "Dispatch Agent" }
  ]
}
```

---

## Lead Recovery Routine (MOST CRITICAL — 90 second window)

```json
{
  "id": "missed-call-recovery",
  "name": "Missed Call Recovery",
  "routine_type": "REACTIVE",
  "event_pattern": "missed_call",
  "assigned_to_role": "Lead Recovery Agent",
  "issue_template": {
    "title": "Missed call recovery — {{caller_number}}",
    "description": "A potential customer called at {{timestamp}} and was not answered. Recovery must happen within 90 seconds.\n\nCaller: {{caller_number}}\nCalled: {{called_number}}\nTime: {{timestamp}}\n\nSuccess condition: SMS sent to customer within 90 seconds AND lead logged in SmartMoving CRM.",
    "success_condition": "SMS sent within 90 seconds + CRM lead created",
    "priority": 100,
    "stall_threshold_minutes": 2
  },
  "enabled": true
}
```

---

## Routine Definitions

```json
{
  "id": "daily-briefing",
  "name": "CEO Daily Briefing",
  "routine_type": "SCHEDULED",
  "cron_expr": "0 7 * * 1-5",
  "assigned_to_role": "CEO",
  "issue_template": {
    "title": "Daily briefing — {{date}}",
    "description": "Generate the daily operations briefing. Include:\n1. Yesterday's completed jobs and revenue\n2. Today's scheduled moves (from SmartMoving)\n3. Open leads requiring follow-up\n4. Fleet issues or maintenance due\n5. Any pending inbox items\n6. Top 3 priorities for today\n\nSuccess condition: Briefing document created and posted as artifact."
  }
}
```

```json
{
  "id": "weekly-tariff-audit",
  "name": "WA UTC 15-C Weekly Compliance Audit",
  "routine_type": "SCHEDULED",
  "cron_expr": "0 6 * * 1",
  "assigned_to_role": "Compliance Agent",
  "issue_template": {
    "title": "Weekly tariff compliance audit — {{week}}",
    "description": "Review all quotes and invoices issued in the past 7 days for WA UTC Tariff 15-C compliance.\n\nCheck:\n- All quotes include minimum charge disclosure (2 hour minimum, $150 minimum)\n- All quotes include travel time disclosure\n- All quotes include required consumer disclosures\n- No pricing violates tariff schedule\n- All binding estimates properly executed\n\nSuccess condition: Compliance report created. Any violations flagged to inbox immediately."
  }
}
```

```json
{
  "id": "fleet-maintenance-check",
  "name": "Daily Fleet Status Check",
  "routine_type": "SCHEDULED",
  "cron_expr": "0 6 * * *",
  "assigned_to_role": "Fleet Coordinator",
  "issue_template": {
    "title": "Fleet status check — {{date}}",
    "description": "Check maintenance status for all 10 trucks: AM02, AM03, AM04, AM05, AM07, AM10, APM01, APM06, APM08, APM09.\n\nFlag:\n- Any truck due for maintenance within 7 days\n- AM04 VIN verification status (2008 Isuzu Dump — VIN NEEDS VERIFICATION)\n- Any truck currently out of service\n\nTechnician contact: Ilya Nikityuk (ASE Certified)\n\nSuccess condition: Fleet status report created. Any flags sent to inbox."
  }
}
```

---

## WA UTC Tariff 15-C Key Rules

```
MINIMUM CHARGES:
  - 2-hour minimum for all local moves
  - $150 minimum charge regardless of hours

REQUIRED DISCLOSURES (must appear on every quote):
  1. "Your Rights as a Consumer of Moving Services in Washington State"
  2. "This estimate is not binding. Actual charges may vary based on actual time."
  3. "You have the right to inspect the mover's tariff at any time."
  4. Travel time disclosure (portal to portal or travel time cap)
  5. Fuel surcharge disclosure (if applicable)

BINDING ESTIMATES:
  - Must be in writing before move begins
  - Customer must sign
  - Mover cannot charge more than binding estimate for listed items

PROHIBITED:
  - Holding goods hostage for payment above estimate
  - Charging for services not listed in tariff
  - Charging for time not worked
```

---

## Brand Voice Guidelines

### A Perfect Mover
```
Tone: Premium, reliable, professional. Seattle-area market.
Keywords: "white glove", "expert", "trusted", "careful"
Avoid: "cheap", "discount", "budget"
Customer address: Professional first name
Quote style: Detailed, value-focused
Review sites: Google first, then Yelp
Ad voice: Authority and trust signals
```

### Affordable Movers LLC
```
Tone: Friendly, value-focused, approachable. Budget-conscious customers.
Keywords: "affordable", "fair pricing", "no hidden fees", "local"
Avoid: "luxury", "premium"
Customer address: Warm, first name
Quote style: Clear, transparent pricing, emphasize value
Review sites: Google first, then Facebook
Ad voice: Relatable and transparent
```

---

## Fleet Reference

```
ID      Type                  Brand       Notes
AM02    Isuzu NPR             Affordable
AM03    Isuzu NPR             Affordable
AM04    2008 Isuzu Dump       Affordable  VIN NEEDS VERIFICATION
AM05    Isuzu NPR             Affordable
AM07    Isuzu NPR             Affordable
AM10    Isuzu NPR             Affordable
APM01   Isuzu NPR             Perfect
APM06   Isuzu NPR             Perfect
APM08   Isuzu NPR             Perfect
APM09   Isuzu NPR             Perfect
```

---

## SmartMoving CRM Integration

```
API Base: https://api.smartmoving.com/v1
Auth: Bearer token (stored in orchestrator .env only — never client-side)

Key endpoints:
  POST /leads              — Create new lead from missed call
  PATCH /leads/{id}        — Update lead status
  GET /jobs/today          — Get today's scheduled moves
  POST /quotes             — Create quote (Quote Agent)
  PATCH /jobs/{id}/status  — Mark job completed (triggers review request)

Lead creation payload for missed call:
{
  "source": "missed_call",
  "phone": "{{caller_number}}",
  "contacted_at": "{{timestamp}}",
  "contact_method": "sms",
  "notes": "Missed call recovered by APEX Lead Recovery Agent",
  "brand": "a_perfect_mover" OR "affordable_movers"
}
```

---

## Template Importer Service

```typescript
// services/template-importer.ts
export async function importMovingCompanyTemplate(
  companyId: string,
  companyName: string,
  brandConfig: { primary_brand: string; secondary_brand?: string }
): Promise<void> {
  const template = await readTemplateJson('moving-company');

  for (const agentDef of template.agents) {
    const personaText = await readPersonaFile(agentDef.persona_file, {
      company_name: companyName,
      ...brandConfig
    });

    await supabase.from('agents').insert({
      company_id: companyId,
      name: agentDef.name,
      role: agentDef.role,
      persona: personaText,
      model_tier: agentDef.model_tier,
      heartbeat_config: DEFAULT_HEARTBEAT_CONFIG,
      status: 'idle'
    });
  }

  for (const routineDef of await readAllRoutines('moving-company')) {
    await supabase.from('routines').insert({
      company_id: companyId,
      ...routineDef
    });
  }

  for (const agentDef of template.agents) {
    for (const skillName of agentDef.installed_skills) {
      await installBuiltinSkill(companyId, skillName);
    }
  }

  for (const event of template.reactive_events) {
    await registerReactiveRoutine(companyId, event);
  }
}
```
