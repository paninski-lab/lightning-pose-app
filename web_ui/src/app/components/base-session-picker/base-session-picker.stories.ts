import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { BaseSessionPickerComponent } from './base-session-picker.component';
import { Session } from '../../session.model';
import { SessionService } from '../../session.service';
import { RpcService } from '../../rpc.service';

// --- Mock data ---

const sessionsByDir: Record<string, Session[]> = {
  '/data/videos': [
    {
      key: 'session1',
      relativePath: 'session1*.mp4',
      views: [
        { viewName: 'view1', videoPath: '/data/videos/session1view1.mp4' },
        { viewName: 'view2', videoPath: '/data/videos/session1view2.mp4' },
      ],
    },
    {
      key: 'session2',
      relativePath: 'session2*.mp4',
      views: [
        { viewName: 'view1', videoPath: '/data/videos/session2view1.mp4' },
        { viewName: 'view2', videoPath: '/data/videos/session2view2.mp4' },
      ],
    },
    {
      key: 'session_2026-04-14_mouse42',
      relativePath: 'session_2026-04-14_mouse42*.mp4',
      views: [
        { viewName: 'view1', videoPath: '/data/videos/session_2026-04-14_mouse42view1.mp4' },
        { viewName: 'view2', videoPath: '/data/videos/session_2026-04-14_mouse42view2.mp4' },
      ],
    },
  ],
  '/data/videos/2026-04-13': [
    {
      key: 'mouse42_trial1',
      relativePath: 'mouse42_trial1*.mp4',
      views: [
        { viewName: 'view1', videoPath: '/data/videos/2026-04-13/mouse42_trial1view1.mp4' },
        { viewName: 'view2', videoPath: '/data/videos/2026-04-13/mouse42_trial1view2.mp4' },
      ],
    },
    {
      key: 'mouse42_trial2',
      relativePath: 'mouse42_trial2*.mp4',
      views: [
        { viewName: 'view1', videoPath: '/data/videos/2026-04-13/mouse42_trial2view1.mp4' },
      ],
    },
  ],
};

const subdirsByDir: Record<string, string[]> = {
  '/data': ['videos', 'models', 'labels'],
  '/data/videos': ['2026-04-13', '2026-04-14', 'calibrations'],
  '/data/videos/2026-04-13': [],
  '/data/videos/2026-04-14': [],
  '/data/videos/calibrations': [],
};

const ungroupedByDir: Record<string, { dirs: string[]; videos: string[] }> = {
  '/data/videos': {
    dirs: ['calibrations', '2026-04-13', '2026-04-14'],
    videos: ['recording_unknown.mp4', 'vid_noview.avi'],
  },
  '/data/videos/2026-04-13': { dirs: [], videos: [] },
};

class MockRpcService {
  async call(method: string, params: any): Promise<any> {
    if (method === 'rglob') {
      const dirs = subdirsByDir[params.baseDir] ?? [];
      await new Promise((r) => setTimeout(r, 150));
      return {
        entries: dirs.map((d) => ({ path: d, type: 'dir' })),
        relativeTo: params.baseDir,
      };
    }
    return {};
  }
}

class MockSessionService {
  async getSessions(baseDir: string) {
    await new Promise((r) => setTimeout(r, 100));
    const u = ungroupedByDir[baseDir] ?? { dirs: [], videos: [] };
    return {
      sessions: sessionsByDir[baseDir] ?? [],
      ungroupedDirs: u.dirs,
      ungroupedVideos: u.videos,
    };
  }
}

// --- Meta ---

const meta: Meta<BaseSessionPickerComponent> = {
  title: 'Components/BaseSessionPicker',
  component: BaseSessionPickerComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, BaseSessionPickerComponent],
      providers: [
        { provide: SessionService, useClass: MockSessionService },
        { provide: RpcService, useClass: MockRpcService },
      ],
    }),
  ],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<BaseSessionPickerComponent>;

export const Basic: Story = {
  args: {
    selected: sessionsByDir['/data/videos'][0],
    baseDir: '/data/videos',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-80 h-96 border border-base-300 rounded-md overflow-hidden bg-base-100 shadow-xl">
        <app-base-session-picker
          [(baseDir)]="baseDir"
          [(selected)]="selected"
        ></app-base-session-picker>
      </div>
      <div class="mt-4 p-2 bg-base-300 rounded text-xs font-mono w-80 overflow-hidden text-ellipsis">
        Dir: {{ baseDir }}<br>Selected: {{ selected?.key || 'none' }}
      </div>
    `,
  }),
};

export const Loading: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        { provide: SessionService, useValue: { getSessions: () => new Promise(() => {}) } },
        { provide: RpcService, useClass: MockRpcService },
      ],
    }),
  ],
  args: { baseDir: '/data/videos' },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-80 h-96 border border-base-300 rounded-md overflow-hidden bg-base-100 shadow-xl">
        <app-base-session-picker [(baseDir)]="baseDir"></app-base-session-picker>
      </div>
    `,
  }),
};

export const WithRightTemplate: Story = {
  args: {
    selected: sessionsByDir['/data/videos'][1],
    baseDir: '/data/videos',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-80 h-96 border border-base-300 rounded-md overflow-hidden bg-base-100 shadow-xl">
        <app-base-session-picker
          [(baseDir)]="baseDir"
          [(selected)]="selected"
          [rightTemplate]="myTemplate"
        ></app-base-session-picker>

        <ng-template #myTemplate let-session>
          <div class="flex gap-1">
            <span class="text-[10px] text-sky-400 font-bold" title="Views">V{{ session.views.length }}</span>
            @if (session.key === 'session1') {
              <span class="text-[10px] text-green-400 font-bold" title="Model 1">M</span>
            }
            @if (session.key === 'session2') {
              <span class="text-[10px] text-red-400 font-bold" title="Model 2">M</span>
            }
          </div>
        </ng-template>
      </div>
    `,
  }),
};
