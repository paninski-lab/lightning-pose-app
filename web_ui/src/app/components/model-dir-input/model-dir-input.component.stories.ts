import type { Meta, StoryObj } from '@storybook/angular';
import { ModelDirInputComponent } from './model-dir-input.component';

const meta: Meta<ModelDirInputComponent> = {
  title: 'App/Components/ModelDirInput',
  component: ModelDirInputComponent,
  tags: ['autodocs'],
  argTypes: {
    dataDir: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<ModelDirInputComponent>;

export const Default: Story = {
  args: {
    dataDir: '/home/user/project',
  },
};

export const CustomPath: Story = {
  args: {
    dataDir: '/home/user/project',
  },
  play: async ({ canvasElement }) => {
    // This is just to demonstrate, in real world we'd use testing-library
    const checkbox = canvasElement.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    if (checkbox) {
      checkbox.click();
    }
  },
};

export const NewDirMode: Story = {
  args: {
    dataDir: '/home/user/project',
    newDirMode: true,
  },
  play: async ({ canvasElement }) => {
    // Uncheck "use default" to show the path editor in edit mode
    const checkbox = canvasElement.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    if (checkbox) {
      checkbox.click();
    }
  },
};
