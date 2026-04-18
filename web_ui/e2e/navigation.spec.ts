import { test, expect } from '@playwright/test';

test('can navigate to the home page', async ({ page }: any) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
});
