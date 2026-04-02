import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { ValidatedPathInputComponent } from './validated-path-input.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { userEvent, within, expect, fn } from 'storybook/test';

const meta: Meta<ValidatedPathInputComponent> = {
  title: 'Shared/ValidatedPathInput',
  component: ValidatedPathInputComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [CommonModule, FormsModule],
    }),
  ],
  args: {
    label: 'Data Directory',
    placeholder: '/path/to/data',
    description:
      'The root of the data directory. Validation checkbox will appear if valid.',
    onChange: fn(),
    onTouched: fn(),
  },
};

export default meta;
type Story = StoryObj<ValidatedPathInputComponent>;

export const Default: Story = {
  args: {
    label: 'Data Directory',
  },
};

export const ValidPath: Story = {
  args: {
    label: 'Valid Path Example',
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');
    await userEvent.type(input, '/home/user/data');
    // Ensure that it displays the "Valid" label
    await expect(canvas.getByText('Valid')).toBeInTheDocument();

    // Verify that the change was emitted via the mocked onChange
    await expect(args.onChange).toHaveBeenCalledWith('/home/user/d');
    await expect(args.onChange).toHaveBeenLastCalledWith('/home/user/data');
  },
};
