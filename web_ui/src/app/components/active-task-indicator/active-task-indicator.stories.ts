import { signal } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ActiveTaskIndicatorComponent } from './active-task-indicator.component';
import { ActiveTaskService } from '../../active-task.service';

const meta: Meta<ActiveTaskIndicatorComponent> = {
  title: 'Components/ActiveTaskIndicator',
  component: ActiveTaskIndicatorComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<ActiveTaskIndicatorComponent>;

export const None: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: ActiveTaskService,
          useValue: {
            activeTask: signal(null),
          },
        },
      ],
    }),
  ],
};

export const Inference: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: ActiveTaskService,
          useValue: {
            activeTask: signal({ taskId: '123', type: 'inference' }),
          },
        },
      ],
    }),
  ],
};

export const Training: Story = {
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: ActiveTaskService,
          useValue: {
            activeTask: signal({ taskId: '456', type: 'training' }),
          },
        },
      ],
    }),
  ],
};
