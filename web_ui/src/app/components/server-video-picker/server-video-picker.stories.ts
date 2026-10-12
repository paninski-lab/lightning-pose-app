import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { ServerVideoPickerComponent } from './server-video-picker.component';
import { RpcService } from '../../rpc.service';
import { ProjectInfoService } from '../../project-info.service';
import { fn } from 'storybook/test';

const mockEntries: Record<string, { path: string; type: 'dir' | 'file'; size?: number }[]> = {
  '/home/user1': [
    { path: 'projects', type: 'dir' },
  ],
  '/home/user1/projects': [
    { path: 'alpha', type: 'dir' },
  ],
  '/home/user1/projects/alpha': [
    { path: 'videos', type: 'dir' },
    { path: 'clip_camA.mp4', type: 'file', size: 1200 },
    { path: 'notes.txt', type: 'file', size: 20 },
  ],
  '/home/user1/projects/alpha/videos': [
    { path: 'session_camA.mp4', type: 'file', size: 4096 },
    { path: 'session_camB.mp4', type: 'file', size: 4096 },
  ],
};

class MockRpcService {
  async call(method: string, params?: { baseDir?: string }): Promise<unknown> {
    if (method === 'rglob') {
      const baseDir = params?.baseDir ?? '';
      return {
        entries: mockEntries[baseDir] ?? [],
        relativeTo: baseDir,
      };
    }
    return {};
  }
}

class MockProjectInfoService {
  projectContext = () => ({
    key: 'demo',
    projectInfo: {
      data_dir: '/home/user1/projects/alpha',
      model_dir: '/home/user1/projects/alpha/models',
      views: ['camA', 'camB'],
      keypoint_names: [],
    },
  });
  globalContext = () => ({
    homeDir: '/home/user1',
    uploadDir: '/tmp/uploads',
    versions: {},
    isEditable: {},
  });
}

const meta: Meta<ServerVideoPickerComponent> = {
  title: 'Components/ServerVideoPicker',
  component: ServerVideoPickerComponent,
  decorators: [
    moduleMetadata({
      providers: [
        { provide: RpcService, useClass: MockRpcService },
        { provide: ProjectInfoService, useClass: MockProjectInfoService },
      ],
    }),
  ],
  args: {
    chosen: fn(),
    dismissed: fn(),
  },
};

export default meta;
type Story = StoryObj<ServerVideoPickerComponent>;

export const Default: Story = {};
