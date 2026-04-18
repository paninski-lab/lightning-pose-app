import { expect, type Locator, type Page } from '@playwright/test';

type CreateSingleViewProjectResult = {
  projectKey: string;
};

type CreateSingleViewProjectOptions = {
  projectKey?: string;
  keypoints?: string[];
};

export async function createSingleViewProject(
  page: Page,
  options: CreateSingleViewProjectOptions = {},
): Promise<CreateSingleViewProjectResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const projectKey = options.projectKey ?? `e2etest-${timestamp}-sv`;
  const keypoints = options.keypoints ?? ['left', 'right'];

  await page.goto('/');

  await page.getByRole('button', { name: 'New Project' }).click();
  await page.getByRole('link', { name: 'From Scratch' }).click();

  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  await expect(page.getByTestId('project-settings')).toBeVisible();

  await page.getByTestId('create-project-name').fill(projectKey);

  await page.getByTestId('create-project-next').click();
  await page.getByTestId('create-project-keypoints').fill(keypoints.join('\n'));
  await page.getByTestId('create-project-next').click();

  await page.getByTestId('create-project-save').click();

  const navbar = page.locator('header nav');
  await expect(navbar.getByRole('link', { name: 'Labeler' })).toBeVisible();

  return { projectKey };
}

async function openPopoverFromButton(
  page: Page,
  button: Locator,
): Promise<Locator> {
  const popoverId = await button.getAttribute('popovertarget');
  if (!popoverId) {
    throw new Error('Popover button missing popovertarget attribute');
  }

  await button.click();

  const popover = page.locator(`#${popoverId}`);
  await expect(popover).toBeVisible();
  return popover;
}

export async function openNavbarPages(
  page: Page,
  projectKey: string,
  pages: Array<{ name: string; pathPart: string }> = [
    { name: 'Labeler', pathPart: '/labeler' },
    { name: 'Models', pathPart: '/models' },
    { name: 'Viewer', pathPart: '/viewer' },
  ],
): Promise<void> {
  const navbar = page.locator('header nav');

  for (const entry of pages) {
    await navbar.getByRole('link', { name: entry.name }).click();
    await expect(page).toHaveURL(new RegExp(`${projectKey}.*${entry.pathPart}`));
    await expect(page.getByText(/Error:/)).toHaveCount(0);
  }
}

export async function deleteE2eTestProject(
  page: Page,
  projectKey: string,
): Promise<void> {
  if (!projectKey.startsWith('e2etest')) {
    throw new Error(
      `Refusing to delete project "${projectKey}" because it does not start with "e2etest"`,
    );
  }

  await page.goto('/');

  const projectLink = page.getByRole('link', {
    name: `Open project ${projectKey}`,
  });
  await expect(projectLink).toBeVisible();

  const card = page
    .locator('a[aria-label^="Open project "]')
    .filter({ has: page.getByRole('heading', { name: projectKey }) })
    .first();
  const cardContainer = card.locator('..');
  const optionsButton = cardContainer.getByRole('button', {
    name: 'Project options',
  });
  const popover = await openPopoverFromButton(page, optionsButton);
  await popover.getByTestId('project-card-delete').click();

  await page.getByTestId('delete-project-permanent').check();
  await page.getByTestId('delete-project-confirm').click();

  await expect(projectLink).toHaveCount(0);
}
