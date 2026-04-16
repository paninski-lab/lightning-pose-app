import { Meta, StoryObj } from '@storybook/angular';
import { ListBoxComponent } from './list-box.component';
import { ListBoxItem } from './list-box.model';

const items: ListBoxItem[] = [
  {
    label: 'session_01_baseline',
    value: 's1',
    description: '/data/sessions/session_01',
    markers: [
      { label: 'M', colorClass: 'text-red-400' },
      { label: 'M', colorClass: 'text-green-400' },
    ],
  },
  {
    label: 'session_02_treatment',
    value: 's2',
    description: '/data/sessions/session_02',
    markers: [{ label: 'M', colorClass: 'text-red-400' }],
  },
  {
    label: 'session_03_recovery',
    value: 's3',
    description: '/data/sessions/session_03',
  },
  {
    label: 'session_04_followup',
    value: 's4',
    description: '/data/sessions/session_04',
    markers: [{ label: 'M', colorClass: 'text-green-400' }],
  },
];

const meta: Meta<ListBoxComponent> = {
  title: 'Components/ListBox',
  component: ListBoxComponent,
  parameters: {
    layout: 'centered',
  },
  args: {
    items: items,
  },
};

export default meta;
type Story = StoryObj<ListBoxComponent>;

export const Default: Story = {
  args: {
    selected: 's2',
  },
};

export const Empty: Story = {
  args: {
    items: [],
  },
};

export const LongList: Story = {
  decorators: [
    (story) => ({
      ...story(),
      template: `<div class="w-80 border rounded-lg overflow-hidden h-64 overflow-y-auto">${story().template}</div>`,
    }),
  ],
  args: {
    items: Array.from({ length: 20 }, (_, i) => ({
      label: `Item ${i + 1}`,
      value: `item-${i + 1}`,
      description: `Description for item ${i + 1}`,
    })),
  },
};

export const LongPath: Story = {
  decorators: [
    (story) => ({
      ...story(),
      template: `<div class="w-80 border rounded-lg overflow-hidden shadow-sm">${story().template}</div>`,
    }),
  ],
  args: {
    items: [
      {
        label: 'very_long_session_name_that_should_truncate_or_be_handled_gracefully',
        value: 'long-1',
        description: '/home/very_long_username/workspace/projects/very-long-project-name-with-many-words/data/raw_data/processed_data/final_results/tables',
      },
      {
        label: 'another_long_label_with_markers',
        value: 'long-2',
        description: '/short/path',
        markers: [
          { label: 'M1', colorClass: 'text-red-400' },
          { label: 'M2', colorClass: 'text-green-400' },
          { label: 'M3', colorClass: 'text-blue-400' },
        ],
      },
    ],
  },
};
