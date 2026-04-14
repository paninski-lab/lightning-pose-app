import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { BaseSessionPickerComponent } from './base-session-picker.component';
import { Session } from '../../session.model';
import { PathPipe } from '../../utils/pipes';

const sessions: Session[] = [
  {
    key: 'session1',
    relativePath: 'videos/2026-04-13/session1',
    views: [
      { viewName: 'view1', videoPath: 'videos/2026-04-13/session1view1.mp4' },
      { viewName: 'view2', videoPath: 'videos/2026-04-13/session1view2.mp4' },
    ],
  },
  {
    key: 'session2',
    relativePath: 'videos/2026-04-13/session2',
    views: [
      { viewName: 'view1', videoPath: 'videos/2026-04-13/session2view1.mp4' },
      { viewName: 'view2', videoPath: 'videos/2026-04-13/session2view2.mp4' },
    ],
  },
  {
    key: 'session3',
    relativePath: 'videos/2026-04-14/session3',
    views: [
      { viewName: 'view1', videoPath: 'videos/2026-04-14/session3view1.mp4' },
    ],
  },
  {
    key: 'session4',
    relativePath: 'videos/long/path/to/my/session4',
    views: [
      { viewName: 'view1', videoPath: 'videos/long/path/to/my/session4view1.mp4' },
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
      imports: [CommonModule, BaseSessionPickerComponent, PathPipe],
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
    sessions,
    selected: sessions[0],
    loading: false,
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-80 h-96 border border-base-300 rounded-md overflow-hidden bg-base-100 shadow-xl">
        <app-base-session-picker
          [sessions]="sessions"
          [(selected)]="selected"
          [loading]="loading"
        ></app-base-session-picker>
      </div>
      <div class="mt-4 p-2 bg-base-300 rounded text-xs font-mono w-80 overflow-hidden text-ellipsis">
        Selected: {{ selected?.key || 'none' }}
      </div>
    `,
  }),
};

export const Loading: Story = {
  args: {
    sessions: [],
    loading: true,
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-80 h-96 border border-base-300 rounded-md overflow-hidden bg-base-100 shadow-xl">
        <app-base-session-picker
          [sessions]="sessions"
          [loading]="loading"
        ></app-base-session-picker>
      </div>
    `,
  }),
};

export const WithRightTemplate: Story = {
  args: {
    sessions,
    selected: sessions[1],
    loading: false,
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="w-80 h-96 border border-base-300 rounded-md overflow-hidden bg-base-100 shadow-xl">
        <app-base-session-picker
          [sessions]="sessions"
          [(selected)]="selected"
          [loading]="loading"
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
