import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-path-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex items-center gap-2 w-full">
      @if (isEditing()) {
        <div class="flex-1 flex gap-2">
          <input
            type="text"
            class="input input-bordered input-sm flex-1 font-mono"
            [ngModel]="path()"
            (ngModelChange)="onPathInputChange($event)"
            (keydown.enter)="toggleEdit()"
            (keydown.escape)="cancelEdit()"
            autofocus
          />
          <button class="btn btn-sm btn-ghost btn-circle" (click)="toggleEdit()" title="Finish editing">
            <span class="material-icons text-sm">check</span>
          </button>
        </div>
      } @else {
        <div class="flex-1 flex items-center overflow-hidden">
          <div class="breadcrumbs text-sm overflow-x-auto whitespace-nowrap scrollbar-hide flex-1">
            <ul>
              @for (part of pathParts(); track $index) {
                <li>
                  <a
                    (click)="onPartClick(part.fullPath)"
                    class="cursor-pointer hover:text-primary transition-colors"
                  >
                    {{ part.name || 'Root' }}
                  </a>
                </li>
              }
            </ul>
          </div>
          <button
            class="btn btn-sm btn-ghost btn-circle shrink-0"
            (click)="toggleEdit()"
            title="Edit as text"
          >
            <span class="material-icons text-sm">edit</span>
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .scrollbar-hide::-webkit-scrollbar {
      display: none;
    }
    .scrollbar-hide {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PathEditorComponent {
  path = input.required<string>();
  pathChange = output<string>();
  partClick = output<string>();

  protected isEditing = signal(false);
  protected editValue = signal('');

  protected pathParts = computed(() => {
    const currentPath = this.path();
    if (!currentPath) return [{ name: '', fullPath: '/' }];

    const parts = currentPath.split('/').filter((p) => p !== '');
    const result = [{ name: '', fullPath: '/' }];

    let cumulativePath = '';
    for (const part of parts) {
      cumulativePath += '/' + part;
      result.push({
        name: part,
        fullPath: cumulativePath,
      });
    }

    return result;
  });

  protected toggleEdit() {
    if (this.isEditing()) {
      // If we were editing, the changes are already handled by onPathInputChange
      // or we could emit here if we want "commit on finish" behavior.
    } else {
      this.editValue.set(this.path());
    }
    this.isEditing.update((v) => !v);
  }

  protected cancelEdit() {
    this.isEditing.set(false);
  }

  protected onPathInputChange(newValue: string) {
    this.pathChange.emit(newValue);
  }

  protected onPartClick(fullPath: string) {
    this.partClick.emit(fullPath);
  }
}
