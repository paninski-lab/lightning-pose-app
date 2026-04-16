import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { BaseSessionPickerComponent } from './base-session-picker.component';
import { Session } from '../../session.model';
import { SessionService } from '../../session.service';

const sessions: Session[] = [
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
    key: 'session3',
    relativePath: 'session3*.mp4',
    views: [
      { viewName: 'view1', videoPath: '/data/videos/session3view1.mp4' },
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
];

/**
 * BaseSessionPickerComponent provides a foundation for session selection.
 * It is built on top of DenseListbox and supports customization of the right slot.
 */
const meta: Meta<BaseSessionPickerComponent> = {
  title: 'Components/BaseSessionPicker',
  component: BaseSessionPickerComponent,
  decorators: [
    moduleMetadata({
      imports: [CommonModule, BaseSessionPickerComponent],
      providers: [
        {
          provide: SessionService,
          useValue: {
            getSessions: async () => ({
              sessions,
              ungroupedDirs: ['calibrations', 'extra_folder'],
              ungroupedVideos: ['session_unknown.mp4', 'vid_noview.avi', 'recording_2026.mp4'],
            }),
          },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<BaseSessionPickerComponent>;

export const Basic: Story = {
  args: {
    selected: sessions[0],
    baseDir: '/data/videos',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-80 h-96 border border-base-300 rounded-md overflow-hidden bg-base-100 shadow-xl">
        <app-base-session-picker
          [baseDir]="baseDir"
          [(selected)]="selected"
        ></app-base-session-picker>
      </div>
      <div class="mt-4 p-2 bg-base-300 rounded text-xs font-mono w-80 overflow-hidden text-ellipsis">
        Selected: {{ selected?.key || 'none' }}
      </div>
    `,
  }),
};

export const Loading: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: SessionService,
          useValue: {
            getSessions: () => new Promise(() => {}),
          },
        },
      ],
    }),
  ],
  args: {
    baseDir: '/data/videos',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-80 h-96 border border-base-300 rounded-md overflow-hidden bg-base-100 shadow-xl">
        <app-base-session-picker [baseDir]="baseDir"></app-base-session-picker>
      </div>
    `,
  }),
};

export const WithRightTemplate: Story = {
  args: {
    selected: sessions[1],
    baseDir: '/data/videos',
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-80 h-96 border border-base-300 rounded-md overflow-hidden bg-base-100 shadow-xl">
        <app-base-session-picker
          [baseDir]="baseDir"
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
