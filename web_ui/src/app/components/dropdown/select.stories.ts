import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { SelectComponent } from './select.component';

const meta: Meta<SelectComponent> = {
  title: 'Components/Select',
  component: SelectComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [CommonModule, ReactiveFormsModule, SelectComponent],
    }),
  ],
};

export default meta;
type Story = StoryObj<SelectComponent>;

const options = [
  { label: 'Option 1', value: 1 },
  { label: 'Option 2', value: 2 },
  { label: 'Option 3', value: 3 },
  {
    label: 'Option 4 - A very long option to test truncation and width',
    value: 4,
  },
];

export const Default: Story = {
  args: {
    options,
    placeholder: 'Select an option',
  },
};

export const WithFormControl: Story = {
  render: (args) => {
    const control = new FormControl(2);
    return {
      props: {
        ...args,
        control,
      },
      template: `
        <div class="flex flex-col gap-4">
          <app-select [options]="options" [formControl]="control"></app-select>
          <div class="alert alert-info w-fit">
            <span>Selected Value: {{ control.value }}</span>
          </div>
        </div>
      `,
    };
  },
  args: {
    options,
  },
};

export const Small: Story = {
  args: {
    options,
    size: 'sm',
  },
};

export const FullWidth: Story = {
  args: {
    options,
    fullWidth: true,
  },
  decorators: [
    (story) => ({
      ...story(),
      template: `<div class="w-80 border border-dashed p-4">${story().template}</div>`,
    }),
  ],
};

export const Disabled: Story = {
  render: (args) => {
    const control = new FormControl({ value: 2, disabled: true });
    return {
      props: {
        ...args,
        control,
      },
      template: `
        <app-select [options]="options" [formControl]="control"></app-select>
      `,
    };
  },
  args: {
    options,
  },
};
