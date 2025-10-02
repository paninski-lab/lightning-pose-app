import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core';
import { TreeListBoxComponent } from '../components/tree-listbox/tree-listbox.component';
import { TreeOptionComponent } from '../components/tree-listbox/tree-option.component';

@Component({
  selector: 'app-sandbox',
  imports: [TreeListBoxComponent, TreeOptionComponent],
  templateUrl: './sandbox.component.html',
  styleUrl: './sandbox.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SandboxComponent {
  readonly tree = signal([
    {
      id: 'fruits',
      label: 'Fruits',
      children: [
        { id: 1, label: 'Apple', meta: { info: 'red' } },
        { id: 2, label: 'Banana', meta: { info: 'yellow' } },
        { id: 3, label: 'Cherry', meta: { info: 'dark red' } },
      ],
    },
    {
      id: 'vegetables',
      label: 'Vegetables',
      children: [
        { id: 4, label: 'Carrot', meta: { info: 'orange' } },
        { id: 5, label: 'Broccoli', meta: { info: 'green' } },
      ],
    },
  ] as const);

  readonly flatNodes = computed(() => {
    const out: {
      nodeId: string;
      parentId: string | null;
      level: number;
      hasChildren: boolean;
      value: unknown;
      label: string;
      meta?: any;
    }[] = [];
    for (const group of this.tree()) {
      out.push({
        nodeId: String(group.id),
        parentId: null,
        level: 0,
        hasChildren: (group.children?.length ?? 0) > 0,
        value: group,
        label: group.label,
      });
      for (const child of group.children ?? []) {
        out.push({
          nodeId: String(child.id),
          parentId: String(group.id),
          level: 1,
          hasChildren: false,
          value: child,
          label: child.label,
          meta: child.meta,
        });
      }
    }
    return out;
  });

  readonly selected = signal<unknown | null>(null);
  readonly selectedLabel = computed(() => {
    const v = this.selected();
    if (v == null) return 'none';
    if (typeof v === 'object') {
      const rec = v as Record<string, unknown>;
      const lbl = rec['label'];
      if (typeof lbl === 'string') return lbl;
      try {
        return JSON.stringify(v);
      } catch {
        return '[object]';
      }
    }
    return String(v as unknown as object);
  });

  onSelect = (value: unknown | null): void => {
    this.selected.set(value);
    // For now, just log
    // eslint-disable-next-line no-console
    console.log('Selected value:', value);
  };
}
