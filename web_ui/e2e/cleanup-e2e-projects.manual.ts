import { test } from './utils/e2e-test';

import { deleteAllE2eTestProjects } from './utils/actions';

test('cleanup all e2etest projects', async ({ page }: any) => {
  test.setTimeout(10 * 60 * 1000);

  await page.goto('/');
  await page.getByRole('heading', { name: 'Projects' }).waitFor();
  try {
    await page
      .locator('a[aria-label^="Open project "]')
      .first()
      .waitFor({ state: 'visible', timeout: 3000 });
  } catch {
    // ignore
  }
  const before = await page
    .locator('a[aria-label^="Open project e2etest"]')
    .count();
  console.log(`cleanup-e2e-projects: found ${before} e2etest* projects before`);

  await deleteAllE2eTestProjects(page);

  await page.goto('/');
  await page.getByRole('heading', { name: 'Projects' }).waitFor();
  try {
    await page
      .locator('a[aria-label^="Open project "]')
      .first()
      .waitFor({ state: 'visible', timeout: 3000 });
  } catch {
    // ignore
  }
  const after = await page
    .locator('a[aria-label^="Open project e2etest"]')
    .count();
  console.log(`cleanup-e2e-projects: found ${after} e2etest* projects after`);
});
