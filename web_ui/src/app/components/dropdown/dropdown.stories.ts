import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { signal } from '@angular/core';
import {
  DropdownComponent,
  DropdownTriggerDirective,
} from './dropdown.component';

const meta: Meta<DropdownComponent> = {
  title: 'Components/Dropdown',
  component: DropdownComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [DropdownComponent, CommonModule, DropdownTriggerDirective],
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
          <button trigger class="btn btn-primary">Click me!</button>
          <ul content class="menu bg-base-100 rounded-box w-56 shadow border border-base-300">
            <li><a>Item 1</a></li>
            <li><a>Item 2</a></li>
            <li><a>Item 3</a></li>
          </ul>
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
              <ul class="menu">
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
