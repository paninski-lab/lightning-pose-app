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
import { ProjectInfoService } from '../../project-info.service';
import { DenseListboxComponent } from '../dense-listbox/dense-listbox.component';
import { DenseListboxItemComponent } from '../dense-listbox/dense-listbox-item.component';
import { PathPipe } from '../../utils/pipes';

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
    PathPipe,
  ],
  template: `
    <div class="flex flex-col w-full">
      <div class="flex items-center gap-2 group/path min-w-0 w-full">
        <div class="flex-1 flex items-center gap-2 min-w-0">
          @if (!isEditing()) {
            <div
              class="bg-transparent hover:bg-base-content/5 px-2 py-1 rounded font-mono text-xs flex items-center gap-2 cursor-pointer transition-colors border border-transparent hover:border-base-content/10 min-w-[100px] flex-1 overflow-hidden"
              (click)="startEditing()"
            >
              <span class="truncate flex-1">{{ path() }}</span>
              <span
                class="material-icons text-sm! opacity-40 group-hover/path:opacity-100 transition-opacity shrink-0"
              >
                edit
              </span>
            </div>
          } @else {
            <div
              class="flex-1 flex items-center gap-0.5 bg-base-300 px-2 py-1 rounded-md overflow-x-auto whitespace-nowrap scrollbar-hide border border-base-content/10"
            >
              @for (part of pathParts(); track part.fullPath) {
                <button
                  (click)="onPartClick(part.fullPath, $event)"
                  class="badge badge-ghost hover:badge-neutral transition-colors font-mono h-5 min-h-5 px-1.5 border-none bg-transparent"
                >
                  {{ part.name || 'Root' }}
                </button>
                @if (!$last) {
                  <span class="text-base-content/80 font-bold font-mono mx-0.5"
                    >/</span
                  >
                }
              }
            </div>

            <button
              class="btn btn-sm btn-ghost btn-circle text-success shrink-0"
              (click)="finishEditing()"
              title="Accept"
            >
              <span class="material-icons">check</span>
            </button>
          }
        </div>
      </div>

      @if (isEditing()) {
        <div class="relative w-full mt-1 z-50">
          <div
            class="absolute top-0 left-0 w-full rounded-box shadow-xl border border-base-300 overflow-hidden max-h-60 flex flex-col"
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

  protected isEditing = signal(false);
  protected editPath = signal('');
  protected subdirectories = signal<string[]>([]);
  protected loading = signal(false);

  private rpc = inject(RpcService);
  private projectInfoService = inject(ProjectInfoService);

  protected pathParts = computed(() => {
    const currentPath = this.editPath();
    if (!currentPath || currentPath === '/')
      return [{ name: '', fullPath: '/' }];

    const parts = currentPath.split('/').filter((p) => p !== '');
    const result = [{ name: '', fullPath: '/' }];

    let cumulativePath = '';
    for (const part of parts) {
      cumulativePath += (cumulativePath === '/' ? '' : '/') + part;
      result.push({
        name: part,
        fullPath: cumulativePath,
      });
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
    this.editPath.set(this.path());
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

  protected onSubdirSelect(subdir: string | undefined) {
    if (!subdir) return;
    const current = this.editPath();
    const nextPath = current === '/' ? `/${subdir}` : `${current}/${subdir}`;
    this.editPath.set(nextPath);
  }

  private async fetchSubdirectories(basePath: string) {
    const projectKey = this.projectInfoService.projectContext()?.key;
    if (!projectKey) {
      // Fallback for Storybook or when projectKey is not available
      // If we're in Storybook, RpcService should be mocked.
    }

    this.loading.set(true);
    try {
      const response = (await this.rpc.call('rglob', {
        projectKey: projectKey || 'mock-project',
        baseDir: basePath,
        pattern: '*',
        noDirs: false,
      })) as RGlobResponse;

      const dirs = response.entries
        .filter((e) => e.type === 'dir')
        .map((e) => e.path);

      this.subdirectories.set(dirs);
    } catch (error) {
      console.error('Failed to fetch subdirectories', error);
      this.subdirectories.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
