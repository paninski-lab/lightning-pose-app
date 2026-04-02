import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { EditProjectPathsDialogComponent } from './edit-project-paths-dialog.component';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

const meta: Meta<EditProjectPathsDialogComponent> = {
  title: 'App/EditProjectPathsDialog',
  component: EditProjectPathsDialogComponent,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<EditProjectPathsDialogComponent>;

export const Default: Story = {
  args: {
    projectKey: 'test-project',
    initialDataDir: '/path/to/data',
    initialModelDir: '/path/to/models',
  },
};

export const NoModelDir: Story = {
  args: {
    projectKey: 'another-project',
    initialDataDir: '/another/path/to/data',
    initialModelDir: null,
  },
};
