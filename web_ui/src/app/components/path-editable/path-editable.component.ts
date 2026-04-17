import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  signal,
  effect,
  viewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PathBarComponent } from '../path-bar/path-bar.component';
import { RpcService } from '../../rpc.service';
import { DenseListboxComponent } from '../dense-listbox/dense-listbox.component';
import { DenseListboxItemComponent } from '../dense-listbox/dense-listbox-item.component';
import {
  DropdownComponent,
  DropdownContentComponent,
  DropdownTriggerComponent,
  DropdownTriggerDirective,
} from '../dropdown/dropdown.component';

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
    DropdownComponent,
    DropdownContentComponent,
    DropdownTriggerComponent,
    DropdownTriggerDirective,
    PathBarComponent,
  ],
  template: `
    <app-dropdown
      class="w-full"
      [fullWidth]="true"
      [(isOpen)]="isDropdownOpen"
      triggerAction="show"
    >
      <app-dropdown-trigger>
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
                <app-path-bar
                  appDropdownTrigger
                  class="flex-1"
                  [(path)]="editPath"
                  [baseDir]="baseDir()"
                  [baseDirLabel]="baseDirLabel()"
                  [newDirMode]="newDirMode()"
                  [(newDirName)]="newDirName"
                  (accept)="finishEditing($event)"
                />
              }
            </div>
          </div>
        </div>
      </app-dropdown-trigger>

      <app-dropdown-content class="w-full">
        @if (isEditing() && !loading() && subdirectories().length > 0) {
          <app-dense-listbox (selectedChange)="onSubdirSelect($event)">
            @for (subdir of subdirectories(); track subdir) {
              <app-dense-listbox-item [value]="subdir">
                <div left class="flex items-center gap-2">
                  <span class="material-icons text-xs opacity-40">folder</span>
                  <span class="text-xs font-mono">{{ subdir }}</span>
                </div>
              </app-dense-listbox-item>
            }
          </app-dense-listbox>
        }
      </app-dropdown-content>
    </app-dropdown>
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
  newDirMode = input<boolean>(false);

  /** When true, the path is shown read-only with no editing affordance. */
  disabled = input(false);

  /** When set, enables relative-path mode. The user cannot navigate above this directory. */
  baseDir = input<string | null>(null);
  /** Label shown in the breadcrumb for the base directory root (e.g. "project"). */
  baseDirLabel = input<string | null>(null);

  protected isEditing = signal(false);
  protected editPath = signal('');
  protected newDirName = signal('');
  protected subdirectories = signal<string[]>([]);
  protected loading = signal(false);
  protected isDropdownOpen = signal(false);
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


  constructor() {
    effect(() => {
      if (this.isEditing()) {
        this.fetchSubdirectories(this.editPath());
      }
    });
  }

  protected startEditing() {
    if (this.disabled()) return;
    const base = this.baseDir();
    const p = this.path();
    this.editPath.set(base && !p.startsWith(base) ? base : p);
    this.isEditing.set(true);
    this.newDirName.set('');
  }

  protected finishEditing(finalPath?: string) {
    this.path.set(finalPath ?? this.editPath());
    this.isEditing.set(false);
    this.isDropdownOpen.set(false);
  }

  protected onSubdirSelect(subdir: string | undefined) {
    if (!subdir) return;
    const current = this.editPath();
    const nextPath = current === '/' ? `/${subdir}` : `${current}/${subdir}`;
    this.autoAcceptOnEmptyDirs = true;
    this.editPath.set(nextPath);
    this.newDirName.set('');
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
      if (dirs.length > 0 && this.isEditing()) {
        this.isDropdownOpen.set(true);
      } else {
        this.isDropdownOpen.set(false);
      }

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
