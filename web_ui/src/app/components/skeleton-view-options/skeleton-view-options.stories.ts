import type { Meta, StoryObj } from '@storybook/angular';
import { SkeletonViewOptionsComponent } from './skeleton-view-options.component';

const meta: Meta<SkeletonViewOptionsComponent> = {
  title: 'Components/SkeletonViewOptions',
  component: SkeletonViewOptionsComponent,
  args: {
    showSkeleton: true,
    thickness: 2,
    opacity: 1,
    invalid: false,
    thicknessIsDefault: true,
    opacityIsDefault: true,
  },
};

export default meta;
type Story = StoryObj<SkeletonViewOptionsComponent>;

export const Shown: Story = {};

export const Hidden: Story = {
  args: { showSkeleton: false },
};

export const Invalid: Story = {
  args: { invalid: true, showSkeleton: true },
};
