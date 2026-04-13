import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { TerminalCommandComponent } from './terminal-command.component';
import { CommonModule } from '@angular/common';

const meta: Meta<TerminalCommandComponent> = {
  title: 'Components/TerminalCommand',
  component: TerminalCommandComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [CommonModule, TerminalCommandComponent],
    }),
  ],
  args: {
    command: 'tensorboard --logdir /home/user/lightning-pose-app/models',
  },
};

export default meta;
type Story = StoryObj<TerminalCommandComponent>;

export const Default: Story = {
  args: {
    command: 'tensorboard --logdir /home/user/lightning-pose-app/models',
  },
};

export const ShortCommand: Story = {
  args: {
    command: 'ls -la',
  },
};

export const LongCommand: Story = {
  args: {
    command:
      'python -m lightning_pose.train --config config.yaml --data_dir /path/to/data --model_dir /path/to/models --num_epochs 100 --batch_size 16 --learning_rate 0.0001',
  },
};
