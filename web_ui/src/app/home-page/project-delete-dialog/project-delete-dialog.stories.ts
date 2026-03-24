import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ProjectDeleteDialogComponent } from './project-delete-dialog.component';
import { ProjectInfoService } from '../../project-info.service';
import { ToastService } from '../../toast.service';
import { fn } from 'storybook/test';
import { FormsModule } from '@angular/forms';

const meta: Meta<ProjectDeleteDialogComponent> = {
  title: 'App/Home/ProjectDeleteDialog',
  component: ProjectDeleteDialogComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [FormsModule],
      providers: [
        {
          provide: ProjectInfoService,
          useValue: {
            deleteProject: fn()
              .mockName('deleteProject')
              .mockResolvedValue(undefined),
          },
        },
        {
          provide: ToastService,
          useValue: {
            showToast: fn().mockName('showToast'),
          },
        },
      ],
    }),
  ],
  args: {
    projectKey: 'test-project',
    dataDir: '/path/to/data',
    modelDir: '/path/to/models',
    done: fn().mockName('done'),
  },
  play: async ({ canvasElement }) => {
    const dialog = canvasElement.querySelector('dialog');
    if (dialog) {
      dialog.showModal();
    }
  },
};

export default meta;
type Story = StoryObj<ProjectDeleteDialogComponent>;

export const Default: Story = {};

export const WithoutModels: Story = {
  args: {
    modelDir: undefined,
  },
};
