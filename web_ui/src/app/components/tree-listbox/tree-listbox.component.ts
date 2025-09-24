import { ChangeDetectionStrategy, Component, ElementRef, Signal, WritableSignal, computed, effect, inject, output, signal, input } from '@angular/core';

// Forward type import inside same folder
import { TreeOptionComponent } from './tree-option.component';

@Component({
  selector: 'app-tree-listbox',
  imports: [],
  template: `
    <ng-content></ng-content>
  `,
  styles: [
    `:host{display:block;outline:none;}
     :host(.tlb-focused){outline: 2px solid var(--focus-color, #3b82f6); outline-offset: 2px;}
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'listbox',
    tabindex: '0',
    '[attr.aria-activedescendant]': 'activeId()',
    "[attr.aria-multiselectable]": '"false"',
    '(keydown)': 'onKeydown($event)',
    '(focus)': 'onFocus()',
    '(blur)': 'onBlur()',
    '[class.tlb-focused]': 'focused()',
  },
})
export class TreeListBoxComponent<T = unknown> {
  // If false, Enter on expandable nodes expands instead of selecting
  readonly allowFolderSelect = input<boolean>(true);
  private readonly el = inject(ElementRef<HTMLElement>);

  // Registered options in DOM order
  private readonly _options: WritableSignal<TreeOptionComponent<T>[]> = signal([]);

  // Expanded state per option instance (WeakMap for GC on destroy)
  private readonly _expanded = new WeakMap<TreeOptionComponent<T>, WritableSignal<boolean>>();

  // Active and selected state managed here
  readonly activeId: WritableSignal<string | null> = signal<string | null>(null);
  readonly selectedValue: WritableSignal<T | null> = signal<T | null>(null);

  // Outputs
  readonly selectionChange = output<T | null>();

  // Focus visual
  readonly focused: WritableSignal<boolean> = signal(false);

  // Public API for options to register
  registerOption(option: TreeOptionComponent<T>): void {
    const current = this._options();
    // Insert keeping DOM order: append is sufficient as options render top-down
    this._options.set([...current, option]);
    // Ensure there's an expanded signal entry for this option (defaults to collapsed)
    this.expandedFor(option);
    // Initialize states on first option
    if (this.activeId() == null) {
      this.activeId.set(option.id);
    }
  }

  unregisterOption(option: TreeOptionComponent<T>): void {
    const list = this._options().filter((o) => o !== option);
    this._options.set(list);
    if (this.activeId() === option.id) {
      this.activeId.set(list.length ? list[0].id : null);
    }
    // If selected value was this one, clear selection
    if (this.selectedValue() === option.value()) {
      this.setSelected(null);
    }
  }

  // Helpers for expanded state
  expandedFor(option: TreeOptionComponent<T>): WritableSignal<boolean> {
    let s = this._expanded.get(option);
    if (!s) {
      s = signal(false);
      this._expanded.set(option, s);
    }
    return s;
  }
  isExpanded(option: TreeOptionComponent<T>): boolean { return this.expandedFor(option)(); }
  toggleExpand(option: TreeOptionComponent<T>): void {
    const s = this.expandedFor(option);
    s.set(!s());
  }

  // Visibility and enabled options
  isVisible(option: TreeOptionComponent<T>): boolean {
    // Root nodes (no parent) are visible
    let pid = option.parentId ? option.parentId() : null;
    const getById = (id: string) => this._options().find(o => (o.nodeId ? o.nodeId() : null) === id);
    while (pid) {
      const parent = getById(pid);
      if (parent && !this.isExpanded(parent)) return false;
      if (!parent) break; // assume visible if parent missing
      pid = parent.parentId ? parent.parentId() : null;
    }
    return true;
  }

  // Derived list of enabled options (visible and not disabled)
  private readonly enabledOptions: Signal<TreeOptionComponent<T>[]> = computed(() =>
    this._options().filter((o) => !o.disabled() && this.isVisible(o)),
  );

  // Keep option visual states in sync
  private readonly _sync = effect(() => {
    const active = this.activeId();
    const selected = this.selectedValue();

    // Ensure active is visible; if not, move to first visible
    const all = this._options();
    const activeOpt = all.find(o => o.id === active) ?? null;
    if (activeOpt && !this.isVisible(activeOpt)) {
      const firstVisible = this.enabledOptions()[0] ?? null;
      this.activeId.set(firstVisible ? firstVisible.id : null);
    }

    const newActive = this.activeId();
    for (const opt of all) {
      opt.active.set(opt.id === newActive);
      const isSelected = selected !== null && opt.value() === selected;
      opt.selected.set(isSelected);
    }
  });

  onFocus(): void {
    this.focused.set(true);
    // Ensure activedescendant points to an existing option
    if (!this.activeId() && this._options().length) {
      this.activeId.set(this._options()[0].id);
    }
  }

  onBlur(): void {
    this.focused.set(false);
  }

  onKeydown(event: KeyboardEvent): void {
    const key = event.key;
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End' || key === 'Enter' || key === ' ' || key === 'ArrowLeft' || key === 'ArrowRight') {
      event.preventDefault();
    }

    const enabled = this.enabledOptions();
    if (enabled.length === 0) return;

    const currentIndex = enabled.findIndex((o) => o.id === this.activeId());
    const first = enabled[0];
    const last = enabled[enabled.length - 1];
    const current = currentIndex >= 0 ? enabled[currentIndex] : null;

    switch (key) {
      case 'ArrowDown': {
        const next = currentIndex >= 0 && currentIndex < enabled.length - 1 ? enabled[currentIndex + 1] : first;
        this.activeId.set(next.id);
        break;
      }
      case 'ArrowUp': {
        const prev = currentIndex > 0 ? enabled[currentIndex - 1] : last;
        this.activeId.set(prev.id);
        break;
      }
      case 'Home': {
        this.activeId.set(first.id);
        break;
      }
      case 'End': {
        this.activeId.set(last.id);
        break;
      }
      case 'ArrowRight': {
        if (current && current.hasChildren && current.hasChildren()) {
          if (!this.isExpanded(current)) {
            this.toggleExpand(current);
          } else {
            // move to next visible
            const next = currentIndex < enabled.length - 1 ? enabled[currentIndex + 1] : first;
            this.activeId.set(next.id);
          }
        }
        break;
      }
      case 'ArrowLeft': {
        if (current && current.hasChildren && current.hasChildren()) {
          if (this.isExpanded(current)) {
            this.toggleExpand(current);
            break;
          }
        }
        // Move to parent if exists
        if (current && current.parentId && current.parentId()) {
          const pid = current.parentId();
          const parent = this._options().find(o => (o.nodeId ? o.nodeId() : null) === pid);
          if (parent) this.activeId.set(parent.id);
        }
        break;
      }
      case 'Enter': {
        const active = current;
        if (active && !active.disabled()) {
          if (active.hasChildren && active.hasChildren() && !this.allowFolderSelect()) {
            // Toggle expand/collapse when folder selection is not allowed
            this.toggleExpand(active);
            // Do not select when allowFolderSelect is false
          } else {
            this.setSelected(active.value());
          }
        }
        break;
      }
      case ' ': {
        const active = this._options().find((o) => o.id === this.activeId());
        if (active && !active.disabled()) {
          this.setSelected(active.value());
        }
        break;
      }
    }
  }

  // Called by option clicks too
  setSelected(value: T | null): void {
    this.selectedValue.set(value);
    this.selectionChange.emit(value);
  }
}
