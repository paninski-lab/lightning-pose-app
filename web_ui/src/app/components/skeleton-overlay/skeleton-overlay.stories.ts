import type { Meta, StoryObj } from '@storybook/angular';
import { SkeletonOverlayComponent } from './skeleton-overlay.component';

const meta: Meta<SkeletonOverlayComponent> = {
  title: 'Components/SkeletonOverlay',
  component: SkeletonOverlayComponent,
  args: {
    thickness: 2,
    opacity: 1,
    segments: [
      { x1: 20, y1: 30, x2: 80, y2: 40 },
      { x1: 80, y1: 40, x2: 60, y2: 90 },
    ],
  },
  render: (args) => ({
    props: args,
    template: `
      <div class="relative h-40 w-40 bg-base-300">
        <app-skeleton-overlay
          [segments]="segments"
          [thickness]="thickness"
          [opacity]="opacity"
        />
      </div>
    `,
  }),
};

export default meta;
type Story = StoryObj<SkeletonOverlayComponent>;

export const Bones: Story = {};

export const Empty: Story = {
  args: { segments: [] },
};
