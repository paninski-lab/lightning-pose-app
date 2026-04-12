import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { signal } from '@angular/core';
import { PathBarComponent } from './path-bar.component';

const meta: Meta<PathBarComponent> = {
  title: 'Components/PathBar',
  component: PathBarComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [PathBarComponent],
    }),
  ],
};

export default meta;
type Story = StoryObj<PathBarComponent>;

export const Default: Story = {
  args: {
    path: '/home/user/projects/my-pose-project',
  },
};

export const RootOnly: Story = {
  args: {
    path: '/',
  },
};

export const LongPath: Story = {
  decorators: [
    (story) => ({
      ...story(),
      template: `<div class="w-72 border border-dashed border-base-300 p-3">${story().template}</div>`,
    }),
  ],
  args: {
    path: '/very/deeply/nested/directory/structure/that/overflows/the/container',
  },
};

/** Live demo: clicking a badge navigates to that prefix; editing the text field commits a new path. */
export const Interactive: Story = {
  render: (args) => {
    const currentPath = signal(args.path);
    const lastPartClick = signal<string | null>(null);

    return {
      props: {
        currentPath,
        lastPartClick,
        onPathChange: (p: string) => currentPath.set(p),
        onPartClick: (p: string) => {
          currentPath.set(p);
          lastPartClick.set(p);
        },
      },
      template: `
        <div class="flex flex-col gap-4 p-4 bg-base-200 rounded-box w-[480px]">
          <app-path-bar
            [path]="currentPath()"
            (pathChange)="onPathChange($event)"
            (partClick)="onPartClick($event)"
          ></app-path-bar>

          <div class="divider my-0"></div>

          <div class="text-xs font-mono flex flex-col gap-1">
            <span class="opacity-50">current path</span>
            <span>{{ currentPath() }}</span>
            @if (lastPartClick()) {
              <span class="opacity-50 mt-1">last badge click</span>
              <span>{{ lastPartClick() }}</span>
            }
          </div>
        </div>
      `,
    };
  },
  args: {
    path: '/home/user/projects/my-pose-project',
  },
};
