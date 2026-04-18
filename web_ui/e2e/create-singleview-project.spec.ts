import { test, expect } from '@playwright/test';
import { createSingleViewProject, openNavbarPages } from './utils/actions';

test('create new single-view project and open all navbar pages', async ({ page }: any) => {
  test.setTimeout(120_000);
  const { projectKey } = await createSingleViewProject(page, {
    keypoints: ['left', 'right'],
  });

  await openNavbarPages(page, projectKey);

  const navbar = page.locator('header nav');
  await navbar.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
});
