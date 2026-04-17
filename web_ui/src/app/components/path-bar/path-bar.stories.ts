import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { PathBarComponent } from './path-bar.component';

const meta: Meta<PathBarComponent> = {
  title: 'Components/PathBar',
  component: PathBarComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, PathBarComponent],
    }),
  ],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<PathBarComponent>;

export const Default: Story = {
  args: {
    path: '/home/user/documents',
    showActions: true,
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] p-4 bg-base-100 rounded-lg shadow border border-base-300">
        <app-path-bar 
          [(path)]="path" 
          [showActions]="showActions"
        ></app-path-bar>
        <div class="mt-4 p-2 bg-base-200 rounded text-xs font-mono">
          Path signal: {{ path }}
        </div>
      </div>
    `,
  }),
};

export const RelativeMode: Story = {
  args: {
    path: '/home/user/projects/lightning-pose/data',
    baseDir: '/home/user/projects/lightning-pose',
    baseDirLabel: 'lightning-pose',
    showActions: true,
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] p-4 bg-base-100 rounded-lg shadow border border-base-300">
        <div class="text-xs mb-2 opacity-60">Base directory: /home/user/projects/lightning-pose</div>
        <app-path-bar 
          [(path)]="path" 
          [baseDir]="baseDir"
          [baseDirLabel]="baseDirLabel"
          [showActions]="showActions"
        ></app-path-bar>
        <div class="mt-4 p-2 bg-base-200 rounded text-xs font-mono">
          Path signal: {{ path }}
        </div>
      </div>
    `,
  }),
};

export const NewDirectoryMode: Story = {
  args: {
    path: '/home/user/documents',
    newDirMode: true,
    newDirName: 'new-folder',
    showActions: true,
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] p-4 bg-base-100 rounded-lg shadow border border-base-300">
        <app-path-bar 
          [(path)]="path" 
          [newDirMode]="newDirMode"
          [(newDirName)]="newDirName"
          [showActions]="showActions"
          (accept)="path = $event"
        ></app-path-bar>
        <div class="mt-4 p-2 bg-base-200 rounded text-xs font-mono space-y-1">
          <div>Path signal: {{ path }}</div>
          <div>New dir name: {{ newDirName }}</div>
        </div>
      </div>
    `,
  }),
};

export const NoActions: Story = {
  args: {
    path: '/home/user/documents',
    showActions: false,
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] p-4 bg-base-100 rounded-lg shadow border border-base-300">
        <app-path-bar 
          [(path)]="path" 
          [showActions]="showActions"
        ></app-path-bar>
      </div>
    `,
  }),
};

export const LongPath: Story = {
  args: {
    path: '/very/long/path/with/many/segments/to/test/wrapping/behavior/in/the/path/bar/component',
    showActions: true,
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[400px] p-4 bg-base-100 rounded-lg shadow border border-base-300">
        <app-path-bar 
          [(path)]="path" 
          [showActions]="showActions"
        ></app-path-bar>
      </div>
    `,
  }),
};
