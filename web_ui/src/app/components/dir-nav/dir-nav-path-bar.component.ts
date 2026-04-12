import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-dir-nav-path-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isEditing()) {
      <div class="flex items-center gap-1 w-full">
        <input
          #editInput
          type="text"
          class="input input-sm input-bordered font-mono w-full"
          [value]="draft()"
          (input)="draft.set($any($event.target).value)"
          (keydown.enter)="commitEdit()"
          (keydown.escape)="cancelEdit()"
        />
        <button class="btn btn-sm btn-primary" (click)="commitEdit()">Go</button>
        <button class="btn btn-sm btn-ghost" (click)="cancelEdit()">
          <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    } @else {
      <div class="flex items-center gap-1 min-w-0 w-full">
        <div class="breadcrumbs text-sm min-w-0 flex-1 overflow-hidden py-0">
          <ul class="flex-nowrap">
            <li>
              <button
                class="flex items-center gap-1 hover:text-primary transition-colors"
                (click)="segmentClick.emit('/')"
                title="Root"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </button>
            </li>
            @for (seg of segments(); track seg.path) {
              <li>
                <button
                  class="font-mono text-xs hover:text-primary transition-colors max-w-[180px] truncate"
                  [title]="seg.label"
                  (click)="segmentClick.emit(seg.path)"
                >{{ seg.label }}</button>
              </li>
            }
          </ul>
        </div>

        <button
          class="btn btn-xs btn-ghost shrink-0 text-base-content/50 hover:text-base-content"
          title="Edit path"
          (click)="beginEdit()"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </div>
    }
  `,
})
export class DirNavPathBarComponent {
  path = input.required<string>();

  /** Emitted when user navigates by clicking a breadcrumb segment. */
  segmentClick = output<string>();

  /** Emitted when user types and confirms a new path in the edit input. */
  pathChange = output<string>();

  editInput = viewChild<ElementRef<HTMLInputElement>>('editInput');

  isEditing = signal(false);
  draft = signal('');

  segments = computed(() => {
    const p = this.path().replace(/\\/g, '/').replace(/\/+$/, '');
    if (!p || p === '/') return [];
    const parts = p.startsWith('/') ? p.slice(1).split('/') : p.split('/');
    return parts.map((label, i) => {
      const leading = p.startsWith('/') ? '/' : '';
      const path = leading + parts.slice(0, i + 1).join('/');
      return { label, path };
    });
  });

  beginEdit() {
    this.draft.set(this.path());
    this.isEditing.set(true);
    // Focus input after view updates
    setTimeout(() => this.editInput()?.nativeElement.select(), 0);
  }

  commitEdit() {
    const value = this.draft().trim();
    if (value) this.pathChange.emit(value);
    this.isEditing.set(false);
  }

  cancelEdit() {
    this.isEditing.set(false);
  }
}
