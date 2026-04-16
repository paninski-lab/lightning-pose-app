import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RpcService } from '../../rpc.service';
import { DenseListboxComponent } from '../dense-listbox/dense-listbox.component';
import { DenseListboxItemComponent } from '../dense-listbox/dense-listbox-item.component';
import { CopyDirective } from '../../utils/copy.directive';

interface RGlobResponse {
  entries: { path: string; type?: 'dir' | 'file' }[];
  relativeTo: string;
}

@Component({
  selector: 'app-path-editable',
  standalone: true,
  imports: [
    CommonModule,
    DenseListboxComponent,
    DenseListboxItemComponent,
    CopyDirective,
  ],
  template: `
    <div class="flex flex-col w-full">
      <div class="flex items-center gap-2 group/path min-w-0 w-full">
        <div class="flex-1 flex items-center gap-2 min-w-0">
          @if (!isEditing()) {
            <div
              class="px-2 py-1 rounded font-mono text-xs flex items-center gap-2 transition-colors border min-w-[100px] flex-1 overflow-hidden"
              [title]="path()"
              [class.bg-transparent]="!disabled()"
              [class.hover:bg-base-content/5]="!disabled()"
              [class.cursor-pointer]="!disabled()"
              [class.border-transparent]="!disabled()"
              [class.hover:border-base-content/10]="!disabled()"
              [class.opacity-50]="disabled()"
              [class.cursor-default]="disabled()"
              [class.border-base-content/10]="disabled()"
              (click)="startEditing()"
            >
              <span class="truncate flex-1">{{ displayPath() }}</span>
              @if (!disabled()) {
                <span
                  class="material-icons text-sm! opacity-40 group-hover/path:opacity-100 transition-opacity shrink-0"
                >
                  edit
                </span>
              }
            </div>
          } @else {
            <div
              class="flex-1 flex items-center flex-wrap gap-y-0.5 gap-x-0 bg-base-300 px-2 py-1 rounded-md border border-base-content/10"
            >
              @for (part of pathParts(); track part.fullPath) {
                @if ($last && pathParts().length > 1) {
                  <span class="flex items-center gap-0.5 font-mono text-xs px-1 py-0.5 rounded bg-base-content/10">
                    <span>{{ part.name }}</span>
                    <button
                      (click)="onClearLastPart($event)"
                      class="material-icons text-xs! leading-none cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
                    >close</button>
                  </span>
                } @else {
                  <button
                    (click)="onPartClick(part.fullPath, $event)"
                    class="font-mono text-xs px-1 py-0.5 rounded cursor-pointer transition-colors hover:bg-base-content/10 hover:text-base-content"
                  >
                    {{ part.name || 'Root' }}
                  </button>
                  @if (!$last) {
                    <span class="text-base-content/50 font-mono mx-0.5">/</span>
                  }
                }
              }
              <div class="flex items-center gap-1 ml-auto shrink-0">
                <button
                  [appCopy]="editPath()"
                  #copy="appCopy"
                  class="btn btn-xs btn-ghost"
                  title="Copy path"
                >
                  <span class="material-icons text-sm!" [class.text-success]="copy.isCopied()">
                    {{ copy.isCopied() ? 'check' : 'content_copy' }}
                  </span>
                </button>
                <button
                  class="btn btn-xs btn-primary shrink-0"
                  (click)="finishEditing()"
                  title="Accept"
                >
                  <span class="material-icons text-sm!">check</span>
                </button>
              </div>
            </div>
          }
        </div>
      </div>

      @if (isEditing()) {
        <div class="relative w-full mt-1 z-50">
          <div
            class="absolute top-0 left-0 w-full rounded-box shadow-xl border border-base-300 max-h-60 overflow-y-auto flex flex-col"
          >
            @if (!loading()) {
              @if (subdirectories().length > 0) {
                <app-dense-listbox (selectedChange)="onSubdirSelect($event)">
                  @for (subdir of subdirectories(); track subdir) {
                    <app-dense-listbox-item [value]="subdir">
                      <div left class="flex items-center gap-2">
                        <span class="material-icons text-xs opacity-40"
                          >folder</span
                        >
                        <span class="text-xs font-mono">{{ subdir }}</span>
                      </div>
                    </app-dense-listbox-item>
                  }
                </app-dense-listbox>
              }
            }
          </div>
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
export class PathEditableComponent {
  path = model.required<string>();

  /** When true, the path is shown read-only with no editing affordance. */
  disabled = input(false);

  /** When set, enables relative-path mode. The user cannot navigate above this directory. */
  baseDir = input<string | null>(null);
  /** Label shown in the breadcrumb for the base directory root (e.g. "project"). */
  baseDirLabel = input<string | null>(null);

  protected isEditing = signal(false);
  protected editPath = signal('');
  protected subdirectories = signal<string[]>([]);
  protected loading = signal(false);
  private autoAcceptOnEmptyDirs = false;

  private rpc = inject(RpcService);

  /** The path shown in display (non-edit) mode — relative when baseDir is set. */
  protected displayPath = computed(() => {
    const base = this.baseDir();
    const p = this.path();
    if (base && p.startsWith(base)) {
      const rel = p.slice(base.length).replace(/^\//, '');
      const label = this.baseDirLabel() ?? base.split('/').pop() ?? base;
      return rel ? `${label}/${rel}` : label;
    }
    return p;
  });

  protected pathParts = computed(() => {
    const currentPath = this.editPath();
    const base = this.baseDir();

    if (base) {
      const rootLabel = this.baseDirLabel() ?? base.split('/').pop() ?? base;
      // Guard: if editPath somehow escaped above baseDir, clamp to base
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

    // Absolute mode
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

  constructor() {
    effect(
      () => {
        if (this.isEditing()) {
          this.fetchSubdirectories(this.editPath());
        }
      },
      { allowSignalWrites: true },
    );
  }

  protected startEditing() {
    if (this.disabled()) return;
    const base = this.baseDir();
    const p = this.path();
    this.editPath.set(base && !p.startsWith(base) ? base : p);
    this.isEditing.set(true);
  }

  protected finishEditing() {
    this.path.set(this.editPath());
    this.isEditing.set(false);
  }

  protected onPartClick(fullPath: string, event: MouseEvent) {
    event.stopPropagation();
    this.editPath.set(fullPath);
  }

  protected onClearLastPart(event: MouseEvent) {
    event.stopPropagation();
    const parts = this.pathParts();
    if (parts.length > 1) {
      this.editPath.set(parts[parts.length - 2].fullPath);
    }
  }

  protected onSubdirSelect(subdir: string | undefined) {
    if (!subdir) return;
    const current = this.editPath();
    const nextPath = current === '/' ? `/${subdir}` : `${current}/${subdir}`;
    this.autoAcceptOnEmptyDirs = true;
    this.editPath.set(nextPath);
  }

  private async fetchSubdirectories(basePath: string) {
    this.loading.set(true);
    try {
      const response = (await this.rpc.call('rglob', {
        baseDir: basePath,
        pattern: '*',
        noDirs: false,
        stat: true,
      })) as RGlobResponse;

      const dirs = response.entries
        .filter((e) => e.type === 'dir')
        .map((e) => e.path);

      this.subdirectories.set(dirs);
      if (dirs.length === 0 && this.autoAcceptOnEmptyDirs) {
        this.finishEditing();
      }
      this.autoAcceptOnEmptyDirs = false;
    } catch (error) {
      console.error('Failed to fetch subdirectories', error);
      this.subdirectories.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
