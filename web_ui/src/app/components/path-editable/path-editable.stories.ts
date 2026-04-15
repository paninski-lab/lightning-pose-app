import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { PathEditableComponent } from './path-editable.component';
import { RpcService } from '../../rpc.service';
import { ProjectInfoService } from '../../project-info.service';
import { signal } from '@angular/core';

const mockDirectories: Record<string, string[]> = {
  '/': ['home', 'var', 'etc', 'tmp'],
  '/home': ['user1', 'user2'],
  '/home/user1': ['documents', 'pictures', 'videos'],
  '/home/user1/documents': ['work', 'personal'],
  '/var': ['log', 'lib', 'cache'],
  '/etc': ['nginx', 'ssh', 'ssl'],
  '/home/user1/projects': ['alpha', 'beta', 'gamma'],
  '/home/user1/projects/alpha': ['data', 'models', 'videos'],
  '/home/user1/projects/alpha/data': ['raw', 'processed'],
  '/home/user1/projects/alpha/videos': ['session1', 'session2'],
};

class MockRpcService {
  async call(method: string, params?: any): Promise<any> {
    if (method === 'rglob') {
      const baseDir = params.baseDir;
      const dirs = mockDirectories[baseDir] || [];
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        entries: dirs.map((d) => ({ path: d, type: 'dir' })),
        relativeTo: baseDir,
      };
    }
    return {};
  }
}

class MockProjectInfoService {
  projectContext = signal({ key: 'mock-project' });
}

const meta: Meta<PathEditableComponent> = {
  title: 'Components/PathEditable',
  component: PathEditableComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, PathEditableComponent],
      providers: [
        { provide: RpcService, useClass: MockRpcService },
        { provide: ProjectInfoService, useClass: MockProjectInfoService },
      ],
    }),
  ],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<PathEditableComponent>;

export const Default: Story = {
  args: {
    path: '/home/user1',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-100 rounded-lg shadow-xl border border-base-300">
        <app-path-editable [(path)]="path"></app-path-editable>
        <div class="mt-48 p-2 bg-base-300 rounded text-xs font-mono">
          Final path: {{ path }}
        </div>
        <div class="mt-4 text-xs opacity-50">
          Click the edit icon to enter edit mode. Click breadcrumbs or list items to navigate. Click the checkmark to save.
        </div>
      </div>
    `,
  }),
};

export const Root: Story = {
  args: {
    path: '/',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-100 rounded-lg shadow-xl border border-base-300">
        <app-path-editable [(path)]="path"></app-path-editable>
        <div class="mt-48 p-2 bg-base-300 rounded text-xs font-mono">
          Final path: {{ path }}
        </div>
      </div>
    `,
  }),
};

export const LoadingState: Story = {
  args: {
    path: '/home/user1',
  },
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: RpcService,
          useClass: class {
            async call() {
              return new Promise((resolve) =>
                setTimeout(() => resolve({ entries: [] }), 10000)
              );
            }
          },
        },
      ],
    }),
  ],
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-100 rounded-lg shadow-xl border border-base-300">
        <app-path-editable [(path)]="path"></app-path-editable>
        <div class="mt-48 text-xs opacity-50 text-center font-bold text-error">
          (This story simulates a very slow RPC call)
        </div>
      </div>
    `,
  }),
};

export const LongPath: Story = {
  args: {
    path: '/home/user1/documents/work/projects/very-long-project-name/data/raw/session-recordings/2024/january',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-100 rounded-lg shadow-xl border border-base-300">
        <app-path-editable [(path)]="path"></app-path-editable>
        <div class="mt-48 p-2 bg-base-300 rounded text-xs font-mono">
          Final path: {{ path }}
        </div>
        <div class="mt-4 text-xs opacity-50">
          Deep path — verifies the breadcrumb scrolls horizontally.
        </div>
      </div>
    `,
  }),
};

export const LongList: Story = {
  args: {
    path: '/data',
  },
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: RpcService,
          useClass: class {
            async call(_method: string, params?: any) {
              await new Promise((resolve) => setTimeout(resolve, 150));
              const dirs = Array.from({ length: 40 }, (_, i) => `folder-${String(i + 1).padStart(2, '0')}`);
              return {
                entries: dirs.map((d) => ({ path: d, type: 'dir' })),
                relativeTo: params?.baseDir ?? '/data',
              };
            }
          },
        },
      ],
    }),
  ],
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-100 rounded-lg shadow-xl border border-base-300">
        <app-path-editable [(path)]="path"></app-path-editable>
        <div class="mt-4 text-xs opacity-50">
          40 directories — verifies the dropdown scrolls.
        </div>
      </div>
    `,
  }),
};

export const RelativeMode: Story = {
  args: {
    path: '/home/user1/projects/alpha/data',
    baseDir: '/home/user1/projects/alpha',
    baseDirLabel: 'alpha',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-100 rounded-lg shadow-xl border border-base-300">
        <app-path-editable [(path)]="path" [baseDir]="baseDir" [baseDirLabel]="baseDirLabel"></app-path-editable>
        <div class="mt-48 p-2 bg-base-300 rounded text-xs font-mono">
          Final path: {{ path }}
        </div>
        <div class="mt-4 text-xs opacity-50">
          Navigation is locked to the base dir. The breadcrumb root shows "alpha" and you cannot go above it.
        </div>
      </div>
    `,
  }),
};

export const NoDirectories: Story = {
  args: {
    path: '/tmp',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-100 rounded-lg shadow-xl border border-base-300">
        <app-path-editable [(path)]="path"></app-path-editable>
        <div class="mt-48 text-xs opacity-50 text-center">
          Navigating to /tmp should show "No directories".
        </div>
      </div>
    `,
  }),
};
