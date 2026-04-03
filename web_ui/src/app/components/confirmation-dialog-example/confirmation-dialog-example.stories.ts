import type { Meta, StoryObj } from '@storybook/angular';
import { ConfirmationDialogExampleComponent } from './confirmation-dialog-example.component';

const meta: Meta<ConfirmationDialogExampleComponent> = {
  title: 'Shared/ConfirmationDialogExample',
  component: ConfirmationDialogExampleComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<ConfirmationDialogExampleComponent>;

export const Default: Story = {};
