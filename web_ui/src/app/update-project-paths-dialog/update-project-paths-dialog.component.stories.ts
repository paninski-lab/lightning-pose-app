import type { Meta, StoryObj } from '@storybook/angular';
import { UpdateProjectPathsDialogComponent } from './update-project-paths-dialog.component';

const meta: Meta<UpdateProjectPathsDialogComponent> = {
  title: 'App/Dialogs/UpdateProjectPaths',
  component: UpdateProjectPathsDialogComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<UpdateProjectPathsDialogComponent>;

export const Default: Story = {
  args: {
    projectKey: 'test-project',
    initialDataDir: '/home/user/data',
    initialModelDir: '/home/user/data/models',
  },
};

export const CustomModelDir: Story = {
  args: {
    projectKey: 'test-project',
    initialDataDir: '/home/user/data',
    initialModelDir: '/custom/models/path',
  },
};
