import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  model,
  output,
  viewChild,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CopyDirective } from '../../utils/copy.directive';

@Component({
  selector: 'app-path-bar',
  standalone: true,
  imports: [CommonModule, CopyDirective],
  template: `
    <div
      class="flex-1 flex items-center flex-wrap gap-y-0.5 gap-x-0 bg-base-300 px-2 py-1 rounded-md border border-base-content/10"
    >
      @for (part of pathParts(); track part.fullPath) {
        @if ($last && pathParts().length > 1 && !newDirMode()) {
          <span
            class="flex items-center gap-0.5 font-mono text-xs px-1 py-0.5 rounded bg-base-content/10"
          >
            <span>{{ part.name }}</span>
            <button
              (click)="onClearLastPart($event)"
              class="material-icons text-xs! leading-none cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
            >
              close
            </button>
          </span>
        } @else {
          <button
            (click)="onPartClick(part.fullPath, $event)"
            class="font-mono text-xs px-1 py-0.5 rounded cursor-pointer transition-colors hover:bg-base-content/10 hover:text-base-content"
          >
            {{ part.name || 'Root' }}
          </button>
        }
        @if (!$last || newDirMode()) {
          <span class="text-base-content/50 font-mono mx-0.5">/</span>
        }
      }
      @if (newDirMode()) {
        <input
          #newDirInput
          type="text"
          [value]="newDirName()"
          (input)="newDirName.set(newDirInput.value)"
          (keydown.enter)="onAccept()"
          class="bg-transparent border-none outline-none font-mono text-xs p-0 min-w-[50px] flex-1"
          placeholder="new directory..."
        />
      }
      @if (showActions()) {
        <div class="flex items-center gap-1 ml-auto shrink-0">
          <button
            [appCopy]="path()"
            #copy="appCopy"
            class="btn btn-xs btn-ghost"
            title="Copy path"
          >
            <span
              class="material-icons text-sm!"
              [class.text-success]="copy.isCopied()"
            >
              {{ copy.isCopied() ? 'check' : 'content_copy' }}
            </span>
          </button>
          <button
            class="btn btn-xs btn-primary shrink-0"
            (click)="onAccept()"
            title="Accept"
          >
            <span class="material-icons text-sm!">check</span>
          </button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PathBarComponent {
  /** The current path being navigated. Can be two-way bound. */
  path = model.required<string>();
  /** Optional base directory to restrict navigation. */
  baseDir = input<string | null>(null);
  /** Label for the base directory. */
  baseDirLabel = input<string | null>(null);
  /** Whether to show a 'new directory' input at the end. */
  newDirMode = input(false);
  /** The name for the new directory. Can be two-way bound. */
  newDirName = model('');
  /** Whether to show the Copy and Accept action buttons. */
  showActions = input(true);

  /** Emitted when the user confirms the path (e.g. clicks Accept or presses Enter). */
  accept = output<string>();

  private newDirInput = viewChild<ElementRef<HTMLInputElement>>('newDirInput');

  constructor() {
    effect(() => {
      if (this.newDirMode()) {
        const inputEl = this.newDirInput()?.nativeElement;
        if (inputEl) {
          inputEl.focus();
        }
      }
    });
  }

  protected pathParts = computed(() => {
    const currentPath = this.path();
    const base = this.baseDir();

    if (base) {
      const rootLabel = this.baseDirLabel() ?? base.split('/').pop() ?? base;
      const effectivePath = currentPath.startsWith(base) ? currentPath : base;
      const relative = effectivePath.slice(base.length).replace(/^\//, '');
      if (!relative) return [{ name: rootLabel, fullPath: base }];

      const parts = relative.split('/').filter((p) => p !== '');
      const result: { name: string; fullPath: string }[] = [
        { name: rootLabel, fullPath: base },
      ];
      let cumulativePath = base;
      for (const part of parts) {
        cumulativePath += '/' + part;
        result.push({ name: part, fullPath: cumulativePath });
      }
      return result;
    }

    if (!currentPath || currentPath === '/')
      return [{ name: '', fullPath: '/' }];

    const parts = currentPath.split('/').filter((p) => p !== '');
    const result: { name: string; fullPath: string }[] = [
      { name: '', fullPath: '/' },
    ];
    let cumulativePath = '';
    for (const part of parts) {
      cumulativePath += '/' + part;
      result.push({ name: part, fullPath: cumulativePath });
    }
    return result;
  });

  protected onPartClick(fullPath: string, event: MouseEvent) {
    event.stopPropagation();
    this.path.set(fullPath);
    this.newDirName.set('');
  }

  protected onClearLastPart(event: MouseEvent) {
    event.stopPropagation();
    const parts = this.pathParts();
    if (parts.length > 1) {
      this.path.set(parts[parts.length - 2].fullPath);
    }
  }

  protected onAccept() {
    let finalPath = this.path();
    const newName = this.newDirName().trim();
    if (this.newDirMode() && newName) {
      finalPath = finalPath === '/' ? `/${newName}` : `${finalPath}/${newName}`;
    }
    this.accept.emit(finalPath);
  }
}
