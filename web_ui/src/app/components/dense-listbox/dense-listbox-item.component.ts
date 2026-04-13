import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { Highlightable } from '@angular/cdk/a11y';

let nextId = 0;

@Component({
  selector: 'app-dense-listbox-item',
  standalone: true,
  template: `
    <div class="flex items-center justify-between w-full h-full min-w-0 pointer-events-none">
      <div class="flex items-center min-w-0 flex-grow pointer-events-none">
        <ng-content select="[left]"></ng-content>
      </div>
      <div class="flex items-center shrink-0 ml-2 pointer-events-none">
        <ng-content select="[right]"></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        padding: 0.25rem; /* p-1 */
        border-radius: 0.125rem; /* rounded-sm */
        cursor: pointer;
        white-space: nowrap; /* text-nowrap */
        transition: background-color 150ms;
        min-height: 1.75rem;
        user-select: none;
        --selected-bg: var(--color-sky-700, #0369a1);
      }
      :host(:hover) {
        background-color: color-mix(
          in oklch,
          var(--color-base-content, currentColor),
          transparent 90%
        );
      }
      :host(.selected) {
        background-color: var(--selected-bg);
        color: white;
      }
      :host(.active) {
        outline: 1px solid var(--selected-bg);
        outline-offset: -1px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'option',
    '[attr.id]': 'id',
    '[attr.aria-selected]': 'selected()',
    '[class.selected]': 'selected()',
    '[class.active]': 'active()',
  },
})
export class DenseListboxItemComponent<T = any> implements Highlightable {
  value = input.required<T>();
  selected = input(false);
  private _active = signal(false);
  active = this._active.asReadonly();

  protected id = `dense-listbox-item-${nextId++}`;

  elementRef = inject(ElementRef);

  setActiveStyles(): void {
    this._active.set(true);
  }
  setInactiveStyles(): void {
    this._active.set(false);
  }
}
