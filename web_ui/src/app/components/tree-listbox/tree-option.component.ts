import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnInit,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
import { TreeListBoxComponent } from './tree-listbox.component';

let uid = 0;

@Component({
  selector: 'app-tree-option',
  imports: [],
  template: `
    <span
      class="caret"
      (click)="onToggleClick($event)"
      [style.visibility]="hasChildren() ? 'visible' : 'hidden'"
      [style.display]="'inline-block'"
      [style.width.px]="12"
      aria-hidden="true"
      >{{ expanded() ? '▾' : '▸' }}</span
    >
    <ng-content></ng-content>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 0.25rem 0.5rem;
        cursor: pointer;
      }
      :host(.disabled) {
        cursor: not-allowed;
        opacity: 0.6;
      }
      :host(.active) {
        background: var(--active-bg, #eef2ff);
      }
      :host(.selected) {
        background: var(--selected-bg, #dbeafe);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'option',
    '[id]': 'id',
    '[attr.aria-selected]': 'selected()',
    '[attr.aria-disabled]': 'disabled() ? "true" : null',
    '[attr.aria-expanded]':
      'hasChildren() ? (expanded() ? "true" : "false") : null',
    '[style.padding-left.px]': 'indentPx()',
    '[style.display]': 'visible() ? "block" : "none"',
    '[class.active]': 'active()',
    '[class.selected]': 'selected()',
    '[class.disabled]': 'disabled()',
    '(click)': 'onClick()',
  },
})
export class TreeOptionComponent<T = unknown> implements OnInit {
  private readonly listbox = inject<TreeListBoxComponent<T>>(
    TreeListBoxComponent as any,
  );

  // Inputs for flat tree metadata
  readonly nodeId = input.required<string>();
  readonly parentId = input<string | null>(null);
  readonly level = input<number>(0);
  readonly hasChildren = input<boolean>(false);

  readonly value = input.required<T>();
  readonly disabled = input<boolean>(false);

  // Local states controlled by listbox
  readonly active: WritableSignal<boolean> = signal(false);
  readonly selected: WritableSignal<boolean> = signal(false);

  // Expand/collapse and visibility resolved via listbox
  readonly expanded: Signal<boolean> = computed(() =>
    this.listbox.isExpanded(this),
  );
  readonly visible: Signal<boolean> = computed(() =>
    this.listbox.isVisible(this),
  );

  // Each option needs a stable id for aria-activedescendant
  readonly id: string = `tlb-opt-${++uid}`;

  indentPx(): number {
    return (this.level ? this.level() : 0) * 12;
  }

  ngOnInit(): void {
    this.listbox.registerOption(this);
  }

  onToggleClick(event: MouseEvent): void {
    event.stopPropagation();
    if (this.hasChildren()) {
      this.listbox.toggleExpand(this);
    }
  }

  onClick(): void {
    if (this.disabled()) return;
    this.listbox.activeId.set(this.id);
    this.listbox.setSelected(this.value());
  }

  ngOnDestroy(): void {
    this.listbox.unregisterOption(this);
  }
}
