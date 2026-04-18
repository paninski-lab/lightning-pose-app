import { test, expect } from '@playwright/test';

test('home page shows New Project button', async ({ page }: any) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible();
});
