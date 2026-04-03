import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ModelDeleteDialogComponent } from './model-delete-dialog.component';
import { SessionService } from '../../session.service';
import { ToastService } from '../../toast.service';
import { fn } from 'storybook/test';
import { FormsModule } from '@angular/forms';

const meta: Meta<ModelDeleteDialogComponent> = {
  title: 'App/Models/ModelDeleteDialog',
  component: ModelDeleteDialogComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [FormsModule],
      providers: [
        {
          provide: SessionService,
          useValue: {
            deleteModel: fn()
              .mockName('deleteModel')
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
type Story = StoryObj<ModelDeleteDialogComponent>;

export const Default: Story = {};
