import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
  output,
} from '@angular/core';
import { ListBoxItem } from './list-box.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-list-box',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ul
      class="w-full relative flex flex-col"
      tabindex="0"
      role="listbox"
    >
      @for (item of items(); track item.value) {
        <li
          tabindex="0"
          role="option"
          [attr.aria-selected]="selected() === item.value"
          class="text-nowrap px-2 py-1 rounded-sm flex items-center justify-between cursor-pointer transition-colors"
          [class.hover:bg-base-content/10]="selected() !== item.value"
          [class.bg-sky-700]="selected() === item.value"
          [class.text-white]="selected() === item.value"
          (click)="handleSelect(item)"
          (keydown.enter)="handleSelect(item)"
          (keydown.space)="handleSelect(item); $event.preventDefault()"
        >
          <div class="flex flex-col min-w-0">
            <span class="truncate font-medium text-sm">{{ item.label }}</span>
            @if (item.description) {
              <span
                class="text-[10px] truncate opacity-70"
                [class.text-white]="selected() === item.value"
              >
                {{ item.description }}
              </span>
            }
          </div>

          @if (item.markers?.length) {
            <div class="flex items-center gap-1 ml-2 shrink-0">
              @for (marker of item.markers; track marker.label) {
                <span
                  class="text-[10px] font-bold uppercase tracking-wider"
                  [ngClass]="marker.colorClass"
                >
                  {{ marker.label }}
                </span>
              }
            </div>
          }
        </li>
      } @empty {
        <li class="p-4 text-center text-sm text-base-content/50 italic">
          No items available.
        </li>
      }
    </ul>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListBoxComponent<T = any> {
  /** The list of items to display. */
  items = input.required<ListBoxItem<T>[]>();

  /** The currently selected item value (model for two-way binding). */
  selected = model<T | undefined>();

  /** Emitted when an item is clicked/selected. */
  itemSelect = output<ListBoxItem<T>>();

  protected handleSelect(item: ListBoxItem<T>) {
    this.selected.set(item.value);
    this.itemSelect.emit(item);
  }
}
