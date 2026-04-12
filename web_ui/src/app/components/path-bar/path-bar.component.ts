import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-path-bar',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'flex items-center w-full' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isEditing()) {
      <div class="flex items-center gap-1 w-full">
        <input
          autofocus
          type="text"
          class="input input-sm input-bordered font-mono flex-1 min-w-0"
          [ngModel]="draftPath()"
          (ngModelChange)="draftPath.set($event)"
          (keydown.enter)="commitEdit()"
          (keydown.escape)="cancelEdit()"
        />
        <button
          class="btn btn-sm btn-ghost btn-circle"
          (click)="commitEdit()"
          title="Confirm"
        >
          <span class="material-icons text-base">check</span>
        </button>
        <button
          class="btn btn-sm btn-ghost btn-circle"
          (click)="cancelEdit()"
          title="Cancel"
        >
          <span class="material-icons text-base">close</span>
        </button>
      </div>
    } @else {
      <div class="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
        @for (part of pathParts(); track part.fullPath) {
          <div class="flex items-center gap-1 shrink-0">
            <button
              class="badge badge-ghost font-mono text-xs hover:badge-primary transition-colors cursor-pointer"
              (click)="partClick.emit(part.fullPath)"
              [title]="part.fullPath"
            >
              {{ part.label }}
            </button>
            @if (!$last) {
              <span class="text-base-content/30 text-xs select-none">/</span>
            }
          </div>
        }
      </div>
      <button
        class="btn btn-sm btn-ghost btn-circle shrink-0 ml-1"
        (click)="startEdit()"
        title="Edit path"
      >
        <span class="material-icons text-base">edit</span>
      </button>
    }
  `,
})
export class PathBarComponent {
  path = input.required<string>();

  /** Emitted when the user confirms a plain-text edit (Enter or ✓). */
  pathChange = output<string>();

  /** Emitted when the user clicks a path badge. Carries the full path up to that segment. */
  partClick = output<string>();

  protected isEditing = signal(false);
  protected draftPath = signal('');

  protected pathParts = computed(() => {
    const segments = this.path()
      .split('/')
      .filter((s) => s.length > 0);

    const parts: { label: string; fullPath: string }[] = [
      { label: '/', fullPath: '/' },
    ];

    let accumulated = '';
    for (const seg of segments) {
      accumulated += '/' + seg;
      parts.push({ label: seg, fullPath: accumulated });
    }

    return parts;
  });

  protected startEdit() {
    this.draftPath.set(this.path());
    this.isEditing.set(true);
  }

  protected commitEdit() {
    this.pathChange.emit(this.draftPath());
    this.isEditing.set(false);
  }

  protected cancelEdit() {
    this.isEditing.set(false);
  }
}
