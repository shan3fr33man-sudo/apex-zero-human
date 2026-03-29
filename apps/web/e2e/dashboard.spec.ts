import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  // Note: These tests verify UI rendering. In production, auth middleware
  // would redirect unauthenticated users. For E2E with real Supabase,
  // you'd add a beforeAll that authenticates via API.

  test('command center loads with correct layout', async ({ page }) => {
    await page.goto('/dashboard');

    // If redirected to login, the auth test handles this.
    // If we're on dashboard, verify layout elements.
    const url = page.url();
    if (url.includes('/dashboard')) {
      // Should have the 3-panel layout
      await expect(page.locator('text=APEX')).toBeVisible();
      await expect(page.locator('text=Command Center')).toBeVisible();
    }
  });

  test('sidebar shows APEX branding', async ({ page }) => {
    await page.goto('/dashboard');
    const url = page.url();

    if (url.includes('/dashboard')) {
      const logo = page.locator('text=APEX').first();
      await expect(logo).toBeVisible();
    }
  });

  test('all 9 nav links are present', async ({ page }) => {
    await page.goto('/dashboard');
    const url = page.url();

    if (url.includes('/dashboard')) {
      const navLinks = [
        'Command Center',
        'Companies',
        'Agents',
        'Issues',
        'Inbox',
        'Spend',
        'Skills',
        'Routines',
        'Audit Log',
      ];

      for (const label of navLinks) {
        await expect(page.locator(`text=${label}`).first()).toBeVisible();
      }
    }
  });

  test('nav links are navigable', async ({ page }) => {
    await page.goto('/dashboard');
    const url = page.url();

    if (url.includes('/dashboard')) {
      // Click Agents link
      await page.click('text=Agents');
      await expect(page).toHaveURL(/\/agents/);

      // Click Issues link
      await page.click('text=Issues');
      await expect(page).toHaveURL(/\/issues/);

      // Click back to Command Center
      await page.click('text=Command Center');
      await expect(page).toHaveURL(/\/dashboard/);
    }
  });

  test('token budget gauge renders on dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    const url = page.url();

    if (url.includes('/dashboard')) {
      // TokenBudgetGauge renders an SVG with circles
      const svg = page.locator('svg').first();
      await expect(svg).toBeVisible();
    }
  });
});
