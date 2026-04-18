import { test } from '@playwright/test';
import { createSingleViewProject, deleteE2eTestProject } from './utils/actions';

test('delete e2etest project permanently via home page', async ({ page }: any) => {
  test.setTimeout(120_000);

  const { projectKey } = await createSingleViewProject(page, {
    keypoints: ['left', 'right'],
  });

  await deleteE2eTestProject(page, projectKey);
});
