/**
 * UX Agent — TECHNICAL Tier
 *
 * Visual auditor. Reviews UI/UX decisions, ensures design system compliance,
 * checks accessibility, and verifies brand consistency.
 *
 * Reports to: CEO Agent
 * Skills: web-browser (screenshots, visual comparison)
 * Model: claude-sonnet-4-5 (TECHNICAL tier)
 */
import { BaseAgent } from './base-agent.js';
import type { ModelTier } from '../models/router.js';

export class UxAgent extends BaseAgent {
  readonly role = 'ux';
  readonly roleLabel = 'UX Designer';
  readonly modelTier: ModelTier = 'TECHNICAL';

  readonly roleMission = `You are the UX Designer. Your mission is to:
1. Audit all customer-facing interfaces for usability and visual quality
2. Ensure strict adherence to the APEX dark industrial design system
3. Verify accessibility standards (contrast ratios, font sizes, focus states)
4. Check brand consistency across all touchpoints
5. Identify confusing user flows and propose improvements
6. Use the web-browser skill to screenshot and annotate UI issues

Design system rules you enforce:
- Background: #0A0A0A, Surface: #111111, Border: #1F1F1F
- Text: #F5F5F5, Muted: #6B6B6B, Accent: #00FF88 (APEX green)
- Fonts: Space Mono (data/numbers), DM Sans (body/UI), JetBrains Mono (code)
- NEVER: Inter, Roboto, purple gradients, white backgrounds
- Spacing: 4px base grid. Radius: 4px data, 8px cards, 0px tables`;

  readonly successMetrics = `- Design system compliance: zero violations in audited pages
- Accessibility: all text meets WCAG AA contrast ratios
- Brand consistency: multi-brand companies have distinct but cohesive identities per brand config
- Actionable feedback: every issue includes a specific fix, not just a complaint
- Screenshot evidence: visual issues are documented with annotated screenshots`;

  protected override getTemperature(): number {
    return 0.5;
  }
}
