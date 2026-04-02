import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { fn } from 'storybook/test';
import { EditProjectPathsDialogComponent } from './edit-project-paths-dialog.component';
import { ProjectInfoService } from '../../project-info.service';
import { ToastService } from '../../toast.service';

class MockProjectInfoService {
  async updateProjectConfig(_payload: unknown): Promise<void> {
    await new Promise((r) => setTimeout(r, 800));
  }
  async fetchProjects(): Promise<void> {}
}

class MockToastService {
  showToast(_opts: unknown): void {}
}

const meta: Meta<EditProjectPathsDialogComponent> = {
  title: 'Home/EditProjectPathsDialog',
  component: EditProjectPathsDialogComponent,
  decorators: [
    moduleMetadata({
      providers: [
        { provide: ProjectInfoService, useClass: MockProjectInfoService },
        { provide: ToastService, useClass: MockToastService },
      ],
    }),
  ],
  args: {
    done: fn(),
  },
};

export default meta;
type Story = StoryObj<EditProjectPathsDialogComponent>;

export const WithModelDir: Story = {
  args: {
    projectKey: 'my-project',
    dataDir: '/home/user/data/my-project',
    modelDir: '/home/user/models/my-project',
  },
};

export const NoModelDir: Story = {
  args: {
    projectKey: 'my-project',
    dataDir: '/home/user/data/my-project',
    modelDir: null,
  },
};
