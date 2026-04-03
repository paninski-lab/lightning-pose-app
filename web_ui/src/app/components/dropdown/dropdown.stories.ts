import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { signal } from '@angular/core';
import {
  DropdownComponent,
  DropdownTriggerDirective,
  DropdownTriggerComponent,
  DropdownContentComponent,
} from './dropdown.component';

const meta: Meta<DropdownComponent> = {
  title: 'Components/Dropdown',
  component: DropdownComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [
        DropdownComponent,
        CommonModule,
        DropdownTriggerDirective,
        DropdownTriggerComponent,
        DropdownContentComponent,
      ],
    }),
  ],
};

export default meta;
type Story = StoryObj<DropdownComponent>;

export const Default: Story = {
  render: (args) => ({
    props: args,
    template: `
      <div class="p-20 flex justify-center">
        <app-dropdown>
          <app-dropdown-trigger>
            <button appDropdownTrigger class="btn btn-primary">Click me!</button>
          </app-dropdown-trigger>
          <app-dropdown-content>
            <ul class="menu w-52">
              <li><a><span class="material-icons text-sm">info</span> Item 1</a></li>
              <li><a><span class="material-icons text-sm">settings</span> Item 2</a></li>
              <li><a><span class="material-icons text-sm">help</span> Item 3</a></li>
            </ul>
          </app-dropdown-content>
        </app-dropdown>
      </div>
    `,
  }),
};

export const VerticalDots: Story = {
  render: (args) => {
    const selectedItem = signal<string | null>(null);
    const onSelect = (item: string, dropdown: DropdownComponent) => {
      selectedItem.set(item);
      dropdown.close();
      setTimeout(() => {
        selectedItem.set(null);
      }, 2000);
    };
    return {
      props: {
        ...args,
        selectedItem,
        onSelect,
      },
      template: `
        <div class="p-20 flex flex-col items-center gap-4">
          <app-dropdown #dropdown>
            <app-dropdown-trigger>
              <button appDropdownTrigger class="btn btn-ghost btn-circle">
                <span class="material-icons">more_vert</span>
              </button>
            </app-dropdown-trigger>
            <app-dropdown-content>
              <ul class="menu w-40">
                <li><a (click)="onSelect('Edit', dropdown)"><span class="material-icons text-sm">edit</span> Edit</a></li>
                <li><a (click)="onSelect('Delete', dropdown)"><span class="material-icons text-sm">delete</span> Delete</a></li>
                <li><a class="text-error" (click)="onSelect('Block', dropdown)"><span class="material-icons text-sm">block</span> Block</a></li>
              </ul>
            </app-dropdown-content>
          </app-dropdown>

          @if (selectedItem()) {
            <div class="alert alert-info w-fit">
              <span>Selected: {{ selectedItem() }}</span>
            </div>
          }
        </div>
      `,
    };
  },
};

export const RightEdge: Story = {
  render: (args) => ({
    props: args,
    template: `
      <div class="flex justify-end p-4 border border-dashed border-base-300">
        <app-dropdown [alignEnd]="true">
          <app-dropdown-trigger>
            <button appDropdownTrigger class="btn btn-primary">Edge Case</button>
          </app-dropdown-trigger>
          <app-dropdown-content>
            <ul class="menu w-64">
              <li><a><span class="material-icons text-sm">info</span> This should not overflow</a></li>
              <li><a><span class="material-icons text-sm">settings</span> Item 2</a></li>
              <li><a><span class="material-icons text-sm">help</span> Item 3</a></li>
            </ul>
          </app-dropdown-content>
        </app-dropdown>
      </div>
    `,
  }),
};
