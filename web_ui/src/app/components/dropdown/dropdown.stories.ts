import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { signal } from '@angular/core';
import {
  DropdownComponent,
  DropdownContentComponent,
  DropdownTriggerComponent,
  DropdownTriggerDirective,
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

export const FullWidth: Story = {
  render: (args) => ({
    props: args,
    template: `
      <div class="p-10 border border-dashed border-base-300 w-[600px] mx-auto">
        <div class="mb-4 text-sm text-base-content/70 text-center">
          Parent container (600px width)
        </div>
        <app-dropdown class="w-full" [fullWidth]="true">
          <app-dropdown-trigger>
            <button appDropdownTrigger class="btn btn-primary w-full flex justify-between">
              <span>Full Width Trigger</span>
              <span class="material-icons">expand_more</span>
            </button>
          </app-dropdown-trigger>
          <app-dropdown-content>
            <ul class="menu w-full">
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

export const ProgrammaticAndShowTrigger: Story = {
  render: (args) => {
    const isOpen = signal(false);
    return {
      props: {
        ...args,
        isOpen,
        toggle: () => isOpen.set(!isOpen()),
      },
      template: `
        <div class="p-20 flex flex-col items-center gap-4">
          <button class="btn btn-secondary" (click)="toggle()">
            External Toggle Button (Current: {{ isOpen() ? 'Open' : 'Closed' }})
          </button>

          <div class="mt-10 border p-4 relative bg-base-300 rounded">
             <app-dropdown [(isOpen)]="isOpen" triggerAction="show">
               <app-dropdown-trigger>
                 <div appDropdownTrigger class="cursor-pointer px-4 py-2 hover:bg-base-content/5 rounded border border-dashed border-base-content/20">
                   Internal Trigger (Action: "show")
                 </div>
               </app-dropdown-trigger>
               <app-dropdown-content>
                 <div class="p-4 w-64">
                   <p class="text-sm font-bold">Programmatic + "Show" Action</p>
                   <p class="text-sm mt-1">The internal trigger above only OPENS the dropdown. It doesn't toggle it off.</p>
                   <p class="text-sm mt-2">The external button above still toggles it normally.</p>
                   <button class="btn btn-xs btn-error mt-4" (click)="isOpen.set(false)">Close me</button>
                 </div>
               </app-dropdown-content>
             </app-dropdown>
          </div>
        </div>
      `,
    };
  },
};
