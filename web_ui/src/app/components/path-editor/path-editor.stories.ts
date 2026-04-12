import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { PathEditorComponent } from './path-editor.component';
import { CommonModule } from '@angular/common';

const meta: Meta<PathEditorComponent> = {
  title: 'Components/PathEditor',
  component: PathEditorComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [CommonModule, PathEditorComponent],
    }),
  ],
  args: {
    path: '/home/user/lightning-pose/projects/my-new-project',
  },
};

export default meta;
type Story = StoryObj<PathEditorComponent>;

export const Default: Story = {
  args: {
    path: '/home/user/lightning-pose/projects/my-new-project',
  },
};

export const Interactive: Story = {
  render: (args) => ({
    props: {
      ...args,
      onPathChange: (newPath: string) => {
        args.path = newPath;
        console.log('Path changed to:', newPath);
      },
      onPartClick: (part: string) => {
        console.log('Part clicked:', part);
        args.path = part;
      },
    },
    template: `
      <div class="p-4 bg-base-200 rounded-lg">
        <app-path-editor
          [path]="path"
          (pathChange)="onPathChange($event)"
          (partClick)="onPartClick($event)"
        ></app-path-editor>
        <div class="mt-4 text-xs opacity-50">
          Current path: {{ path }}
        </div>
      </div>
    `,
  }),
  args: {
    path: '/home/user/lightning-pose/projects/my-new-project',
  },
};

export const RootPath: Story = {
  args: {
    path: '/',
  },
};

export const LongPath: Story = {
  decorators: [
    (story) => ({
      props: story().props,
      template: `
        <div style="width: 300px; border: 1px dashed #ccc; padding: 10px;">
          <app-path-editor [path]="path"></app-path-editor>
        </div>
      `,
    }),
  ],
  args: {
    path: '/very/long/nested/path/to/some/deeply/located/project/directory/that/should/scroll',
  },
};
