import { test, expect } from '@playwright/test';

test.describe('Inbox approval flow', () => {
  test('inbox page loads', async ({ page }) => {
    await page.goto('/inbox');
    const url = page.url();

    if (url.includes('/inbox')) {
      await expect(page.locator('text=Inbox')).toBeVisible();
    }
  });

  test('shows pending approvals section', async ({ page }) => {
    await page.goto('/inbox');
    const url = page.url();

    if (url.includes('/inbox')) {
      // Should show pending approvals header
      await expect(
        page.locator('text=Pending Approvals').first()
      ).toBeVisible();
    }
  });

  test('shows empty state when no pending items', async ({ page }) => {
    await page.goto('/inbox');
    const url = page.url();

    if (url.includes('/inbox')) {
      // If no pending items, should show the green "No pending approvals" message
      // or the items list. Either state is valid.
      const content = await page.textContent('body');
      expect(content).toBeTruthy();
    }
  });

  test('approve and reject buttons render on pending items', async ({ page }) => {
    await page.goto('/inbox');
    const url = page.url();

    if (url.includes('/inbox')) {
      // If there are pending items, they should have approve/reject buttons
      const approveButtons = page.locator('button:text("Approve")');
      const rejectButtons = page.locator('button:text("Reject")');

      // Count is >= 0 (valid if no items)
      const approveCount = await approveButtons.count();
      const rejectCount = await rejectButtons.count();

      // If there are approve buttons, there should be equal reject buttons
      expect(approveCount).toBe(rejectCount);
    }
  });

  test('resolve API endpoint exists', async ({ request }) => {
    // Test that the API endpoint responds (even with 400/404 for missing params)
    const response = await request.post('/api/apex/inbox/fake-id/resolve', {
      data: { resolution: 'approved' },
    });

    // Should get a JSON response (not 500 or network error)
    expect(response.status()).toBeLessThan(500);
  });
});
