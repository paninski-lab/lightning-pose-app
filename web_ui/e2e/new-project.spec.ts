import { test, expect } from '@playwright/test';

test('new project dropdown opens (stub)', async ({ page }: any) => {
  await page.goto('/');

  const newProject = page.getByRole('button', { name: 'New Project' });
  await expect(newProject).toBeVisible();

  await newProject.click();
  await expect(page.getByRole('link', { name: 'From Scratch' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add Existing' })).toBeVisible();
});
