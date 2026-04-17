import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { DirectoryViewerComponent } from './directory-viewer.component';
import { RpcService } from '../../rpc.service';

const mockDirectories: Record<string, string[]> = {
  '/': ['home', 'var', 'etc', 'tmp'],
  '/home': ['user1', 'user2'],
  '/home/user1': ['documents', 'pictures', 'videos', 'projects'],
  '/home/user1/documents': ['work', 'personal'],
  '/home/user1/projects': ['alpha', 'beta', 'gamma'],
  '/home/user1/projects/alpha': ['data', 'models', 'videos'],
  '/home/user1/projects/alpha/data': ['raw', 'processed'],
  '/home/user1/projects/alpha/videos': ['session1', 'session2'],
  '/tmp': [],
};

class MockRpcService {
  async call(method: string, params?: any): Promise<any> {
    if (method === 'rglob') {
      const baseDir = params.baseDir;
      const dirs = mockDirectories[baseDir] || [];
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 400));
      return {
        entries: dirs.map((d) => ({ path: d, type: 'dir' })),
        relativeTo: baseDir,
      };
    }
    return {};
  }
}

const meta: Meta<DirectoryViewerComponent> = {
  title: 'Components/DirectoryViewer',
  component: DirectoryViewerComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, DirectoryViewerComponent],
      providers: [{ provide: RpcService, useClass: MockRpcService }],
    }),
  ],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<DirectoryViewerComponent>;

export const Default: Story = {
  args: {
    path: '/home/user1',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-200 rounded-xl shadow-2xl border border-base-300">
        <app-directory-viewer [(path)]="path"></app-directory-viewer>
        <div class="mt-4 p-2 bg-base-300 rounded text-xs font-mono">
          Current path: {{ path }}
        </div>
      </div>
    `,
  }),
};

export const RelativeMode: Story = {
  args: {
    path: '/home/user1/projects/alpha/data',
    baseDir: '/home/user1/projects/alpha',
    baseDirLabel: 'alpha-project',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-200 rounded-xl shadow-2xl border border-base-300">
        <app-directory-viewer 
          [(path)]="path"
          [baseDir]="baseDir"
          [baseDirLabel]="baseDirLabel"
        ></app-directory-viewer>
        <div class="mt-4 p-2 bg-base-300 rounded text-xs font-mono">
          Current path: {{ path }}
        </div>
        <div class="mt-2 text-xs opacity-50 italic">
          Locked to /home/user1/projects/alpha
        </div>
      </div>
    `,
  }),
};

export const EmptyDirectory: Story = {
  args: {
    path: '/tmp',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-200 rounded-xl shadow-2xl border border-base-300">
        <app-directory-viewer [(path)]="path"></app-directory-viewer>
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
              return new Promise(() => {}); // Never resolves
            }
          },
        },
      ],
    }),
  ],
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-200 rounded-xl shadow-2xl border border-base-300">
        <app-directory-viewer [(path)]="path"></app-directory-viewer>
      </div>
    `,
  }),
};
