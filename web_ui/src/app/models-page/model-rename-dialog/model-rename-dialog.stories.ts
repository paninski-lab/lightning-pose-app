import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ModelRenameDialogComponent } from './model-rename-dialog.component';
import { SessionService } from '../../session.service';
import { ToastService } from '../../toast.service';
import { fn } from 'storybook/test';
import { ReactiveFormsModule } from '@angular/forms';

const meta: Meta<ModelRenameDialogComponent> = {
  title: 'App/Models/ModelRenameDialog',
  component: ModelRenameDialogComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [ReactiveFormsModule],
      providers: [
        {
          provide: SessionService,
          useValue: {
            renameModel: fn()
              .mockName('renameModel')
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
    modelRelativePath: 'test-model/config.yaml',
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
type Story = StoryObj<ModelRenameDialogComponent>;

export const Default: Story = {};

export const DeepPath: Story = {
  args: {
    modelRelativePath: 'a/b/c/my-model/config.yaml',
  },
};
