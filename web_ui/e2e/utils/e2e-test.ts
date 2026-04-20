import { expect, test as base } from '@playwright/test';

import { deleteE2eTestProject } from './actions';

type E2eFixtures = {
  registerE2eProject: (projectKey: string) => void;
};

export const test = base.extend<E2eFixtures>({
  registerE2eProject: async ({ page }, use, testInfo) => {
    const projectKeys: string[] = [];

    await use((projectKey: string) => {
      projectKeys.push(projectKey);
    });

    if (testInfo.status !== testInfo.expectedStatus) {
      return;
    }

    for (const key of projectKeys.reverse()) {
      try {
        await deleteE2eTestProject(page, key);
      } catch {
        // ignore
      }
    }
  },
});

export { expect };
