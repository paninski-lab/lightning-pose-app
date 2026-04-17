import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { DirectoryViewerComponent } from './directory-viewer.component';
import { RpcService } from '../../rpc.service';
import { ProjectInfoService } from '../../project-info.service';

const mockEntries: Record<string, { path: string; type: 'dir' | 'file' }[]> = {
  '/': [
    { path: 'home', type: 'dir' },
    { path: 'var', type: 'dir' },
    { path: 'etc', type: 'dir' },
    { path: 'tmp', type: 'dir' },
  ],
  '/home': [
    { path: 'user1', type: 'dir' },
    { path: 'user2', type: 'dir' },
  ],
  '/home/user1': [
    { path: 'documents', type: 'dir' },
    { path: 'pictures', type: 'dir' },
    { path: 'videos', type: 'dir' },
    { path: 'projects', type: 'dir' },
  ],
  '/home/user1/documents': [
    { path: 'work', type: 'dir' },
    { path: 'personal', type: 'dir' },
  ],
  '/home/user1/projects': [
    { path: 'alpha', type: 'dir' },
    { path: 'beta', type: 'dir' },
    { path: 'gamma', type: 'dir' },
  ],
  '/home/user1/projects/alpha': [
    { path: 'data', type: 'dir' },
    { path: 'models', type: 'dir' },
    { path: 'videos', type: 'dir' },
  ],
  '/home/user1/projects/alpha/data': [
    { path: 'raw', type: 'dir' },
    { path: 'processed', type: 'dir' },
  ],
  '/home/user1/projects/alpha/videos': [
    { path: 'session1', type: 'dir' },
    { path: 'session2', type: 'dir' },
    { path: 'recording.mp4', type: 'file' },
    { path: 'camera_front.mp4', type: 'file' },
    { path: 'camera_back.mp4', type: 'file' },
    { path: 'metadata.json', type: 'file' },
    { path: 'labels_front.csv', type: 'file' },
    { path: 'labels_back.csv', type: 'file' },
  ],
  '/tmp': [],
};

class MockRpcService {
  async call(method: string, params?: any): Promise<any> {
    if (method === 'rglob') {
      const baseDir = params.baseDir;
      const entries = mockEntries[baseDir] || [];
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 400));
      return {
        entries: entries,
        relativeTo: baseDir,
      };
    }
    return {};
  }
}

class MockProjectInfoService {
  projectInfo = {
    views: ['front', 'back'],
  };
}

const meta: Meta<DirectoryViewerComponent> = {
  title: 'Components/DirectoryViewer',
  component: DirectoryViewerComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, DirectoryViewerComponent],
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

export const VideoFilter: Story = {
  args: {
    path: '/home/user1/projects/alpha/videos',
    fileFilter: 'video',
    isMultiview: false,
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-200 rounded-xl shadow-2xl border border-base-300">
        <app-directory-viewer 
          [(path)]="path"
          [fileFilter]="fileFilter"
          [isMultiview]="isMultiview"
        ></app-directory-viewer>
        <div class="mt-4 p-2 bg-base-300 rounded text-xs font-mono">
          Filter: {{ fileFilter }}, Multiview: {{ isMultiview }}
        </div>
      </div>
    `,
  }),
};

export const MultiviewGrouping: Story = {
  args: {
    path: '/home/user1/projects/alpha/videos',
    fileFilter: 'video',
    isMultiview: true,
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-200 rounded-xl shadow-2xl border border-base-300">
        <app-directory-viewer 
          [(path)]="path"
          [fileFilter]="fileFilter"
          [isMultiview]="isMultiview"
        ></app-directory-viewer>
        <div class="mt-4 p-2 bg-base-300 rounded text-xs font-mono">
          Filter: {{ fileFilter }}, Multiview: {{ isMultiview }}
        </div>
        <div class="mt-2 text-xs opacity-50 italic">
          Should show camera_*.mp4 instead of front/back
        </div>
      </div>
    `,
  }),
};

export const CsvFilter: Story = {
  args: {
    path: '/home/user1/projects/alpha/videos',
    fileFilter: 'csv',
    isMultiview: true,
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-200 rounded-xl shadow-2xl border border-base-300">
        <app-directory-viewer 
          [(path)]="path"
          [fileFilter]="fileFilter"
          [isMultiview]="isMultiview"
        ></app-directory-viewer>
        <div class="mt-4 p-2 bg-base-300 rounded text-xs font-mono">
          Filter: {{ fileFilter }}, Multiview: {{ isMultiview }}
        </div>
        <div class="mt-2 text-xs opacity-50 italic">
          Should show labels_*.csv
        </div>
      </div>
    `,
  }),
};

export const AllFiles: Story = {
  args: {
    path: '/home/user1/projects/alpha/videos',
    fileFilter: 'all',
    isMultiview: false,
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-[500px] h-[400px] p-8 bg-base-200 rounded-xl shadow-2xl border border-base-300">
        <app-directory-viewer 
          [(path)]="path"
          [fileFilter]="fileFilter"
          [isMultiview]="isMultiview"
        ></app-directory-viewer>
        <div class="mt-4 p-2 bg-base-300 rounded text-xs font-mono">
          Filter: {{ fileFilter }}
        </div>
      </div>
    `,
  }),
};
