import type { Meta, StoryObj } from '@storybook/angular';
import { AddExistingProjectDialogComponent } from './add-existing-project-dialog.component';

const meta: Meta<AddExistingProjectDialogComponent> = {
  title: 'App/Dialogs/AddExistingProject',
  component: AddExistingProjectDialogComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<AddExistingProjectDialogComponent>;

export const Default: Story = {
  args: {},
};
