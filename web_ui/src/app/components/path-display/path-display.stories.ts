import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { PathDisplayComponent } from './path-display.component';
import { CommonModule } from '@angular/common';

const meta: Meta<PathDisplayComponent> = {
  title: 'Components/PathDisplay',
  component: PathDisplayComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [CommonModule, PathDisplayComponent],
    }),
  ],
  args: {
    path: '/home/user/lightning-pose/projects/my-new-project',
  },
};

export default meta;
type Story = StoryObj<PathDisplayComponent>;

export const Default: Story = {
  args: {
    path: '/home/user/lightning-pose/projects/my-new-project',
  },
};

export const WithLabel: Story = {
  args: {
    label: 'Project Path',
    path: '/home/user/lightning-pose/projects/my-new-project',
  },
};

export const LongPath: Story = {
  args: {
    label: 'Data Dir',
    path: '/very/long/nested/path/to/some/deeply/located/project/directory/that/might/overflow/the/container/if/not/handled',
  },
};

export const SmallParent: Story = {
  decorators: [
    (story) => ({
      props: story().props,
      template: `
        <div style="width: 250px; border: 1px dashed #ccc; padding: 10px;">
          <app-path-display [path]="path" [label]="label"></app-path-display>
        </div>
      `,
    }),
  ],
  args: {
    label: 'Small Parent Path',
    path: '/very/long/nested/path/to/some/deeply/located/project/directory',
  },
};
