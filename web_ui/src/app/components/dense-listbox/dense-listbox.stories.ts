import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { CommonModule } from '@angular/common';
import { DenseListboxComponent } from './dense-listbox.component';
import { DenseListboxItemComponent } from './dense-listbox-item.component';

/**
 * DenseListbox and DenseListboxItem components provide a compact listbox
 * with support for content projection, keyboard navigation, and single selection.
 * Visual style is based on the viewer sessions panel.
 */
const meta: Meta = {
  title: 'Components/DenseListbox',
  decorators: [
    moduleMetadata({
      imports: [CommonModule, DenseListboxComponent, DenseListboxItemComponent],
    }),
  ],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj;

export const FruitExample: Story = {
  render: (args) => ({
    props: args,
    template: `
      <div class="w-64 h-80 border border-base-300 rounded-md overflow-hidden bg-base-200 shadow-lg">
        <app-dense-listbox [(selected)]="selected">
          @for (fruit of fruits; track fruit.id) {
            <app-dense-listbox-item [value]="fruit.id" [selected]="selected === fruit.id">
              <span left class="text-sm font-medium">{{ fruit.name }}</span>
              <div right class="flex items-center gap-1">
                @if (fruit.error) {
                  <span class="text-[10px] text-error font-bold">ERR</span>
                }
                @if (fruit.count > 0) {
                  <span class="text-[10px] opacity-70 font-mono">x{{ fruit.count }}</span>
                }
              </div>
            </app-dense-listbox-item>
          }
        </app-dense-listbox>
      </div>
      <div class="mt-4 p-2 bg-base-300 rounded text-xs font-mono">
        Selected ID: {{ selected || 'none' }}
      </div>
    `,
  }),
  args: {
    fruits: [
      { id: 'apple', name: 'Apple', count: 5, error: false },
      { id: 'banana', name: 'Banana', count: 0, error: true },
      { id: 'cherry', name: 'Cherry', count: 12, error: false },
      { id: 'date', name: 'Date', count: 3, error: false },
      { id: 'elderberry', name: 'Elderberry', count: 0, error: false },
      { id: 'fig', name: 'Fig', count: 8, error: false },
      { id: 'grape', name: 'Grape', count: 20, error: false },
      { id: 'honeydew', name: 'Honeydew', count: 2, error: true },
      { id: 'kiwi', name: 'Kiwi', count: 15, error: false },
    ],
    selected: 'cherry',
  },
};

export const Simple: Story = {
  render: (args) => ({
    props: args,
    template: `
      <div class="w-48 border border-base-300 rounded-md overflow-hidden bg-base-100">
        <app-dense-listbox [(selected)]="selected">
          <app-dense-listbox-item value="1" [selected]="selected === '1'">
            <span left>Item 1</span>
          </app-dense-listbox-item>
          <app-dense-listbox-item value="2" [selected]="selected === '2'">
            <span left>Item 2</span>
          </app-dense-listbox-item>
          <app-dense-listbox-item value="3" [selected]="selected === '3'">
            <span left>Item 3</span>
          </app-dense-listbox-item>
        </app-dense-listbox>
      </div>
    `,
  }),
  args: {
    selected: '1',
  },
};
