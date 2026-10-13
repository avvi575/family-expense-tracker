import { test, expect } from '@playwright/test';

test('app loads in Chromium, Firefox, and Safari', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await expect(page).toHaveTitle(/Family Expense Tracker/);
  await expect(page.locator('body')).toBeVisible();
});
