import {
  ChangeDetectionStrategy,
  Component,
  contentChildren,
  effect,
  inject,
  Injector,
  model,
  signal,
  untracked,
} from '@angular/core';
import { ActiveDescendantKeyManager } from '@angular/cdk/a11y';
import { DenseListboxItemComponent } from './dense-listbox-item.component';

@Component({
  selector: 'app-dense-listbox',
  standalone: true,
  template: `
    <div
      class="panel-content inset-shadow-xs inset-shadow-black/30 overflow-auto h-full w-full"
    >
      <div
        class="w-full relative flex flex-col focus:outline-hidden"
        role="listbox"
        [attr.aria-activedescendant]="activeDescendantId()"
        tabindex="0"
      >
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(keydown)': 'handleKeydown($event)',
    '(click)': 'handleClick($event)',
  },
})
export class DenseListboxComponent<T = any> {
  /** The currently selected value. */
  selected = model<T | undefined>();

  /** The list of items inside the listbox. */
  items = contentChildren(DenseListboxItemComponent);

  /** CDK KeyManager for handling keyboard navigation. */
  private keyManager: ActiveDescendantKeyManager<DenseListboxItemComponent<T>>;

  /** ID of the currently active item for ARIA. */
  protected activeDescendantId = signal<string | null>(null);

  private injector = inject(Injector);

  constructor() {
    this.keyManager = new ActiveDescendantKeyManager(this.items, this.injector)
      .withWrap()
      .withHomeAndEnd();

    this.keyManager.change.subscribe(() => {
      const activeItem = this.keyManager.activeItem;
      this.activeDescendantId.set(
        activeItem?.elementRef.nativeElement.id || null
      );
    });

    // Synchronize the keyManager active item with external selection changes.
    effect(() => {
      const selectedValue = this.selected();
      const items = this.items();

      untracked(() => {
        if (this.keyManager && selectedValue !== undefined) {
          const index = items.findIndex((item) => item.value() === selectedValue);
          if (index !== -1 && this.keyManager.activeItemIndex !== index) {
            this.keyManager.setActiveItem(index);
          }
        }
      });
    });
  }

  protected handleKeydown(event: KeyboardEvent) {
    if (!this.keyManager) return;

    // Select item on Enter or Space
    if (event.key === 'Enter' || event.key === ' ') {
      const activeItem = this.keyManager.activeItem;
      if (activeItem) {
        this.selectItem(activeItem);
        event.preventDefault();
        return;
      }
    }

    this.keyManager.onKeydown(event);
  }

  protected handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const itemEl = target.closest('app-dense-listbox-item');
    if (itemEl) {
      const item = this.items().find(
        (i) => i.elementRef.nativeElement === itemEl
      );
      if (item) {
        this.selectItem(item);
      }
    }
  }

  private selectItem(item: DenseListboxItemComponent<T>) {
    this.selected.set(item.value());
    const index = this.items().indexOf(item);
    if (index !== -1) {
      this.keyManager?.setActiveItem(index);
    }
  }
}
