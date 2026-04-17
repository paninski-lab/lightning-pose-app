import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RpcService } from '../../rpc.service';
import { PathBarComponent } from '../path-bar/path-bar.component';
import { DenseListboxComponent } from '../dense-listbox/dense-listbox.component';
import { DenseListboxItemComponent } from '../dense-listbox/dense-listbox-item.component';

interface RGlobResponse {
  entries: { path: string; type?: 'dir' | 'file' }[];
  relativeTo: string;
}

@Component({
  selector: 'app-directory-viewer',
  standalone: true,
  imports: [
    CommonModule,
    PathBarComponent,
    DenseListboxComponent,
    DenseListboxItemComponent,
  ],
  template: `
    <div class="flex flex-col gap-2 h-full">
      <app-path-bar
        [(path)]="path"
        [baseDir]="baseDir()"
        [baseDirLabel]="baseDirLabel()"
        [showActions]="false"
      />

      <div
        class="flex-1 overflow-auto border rounded border-base-content/10 bg-base-100 min-h-[200px]"
      >
        @if (loading()) {
          <div class="flex items-center justify-center h-full p-4">
            <span class="loading loading-spinner loading-md opacity-20"></span>
          </div>
        } @else {
          <app-dense-listbox (selectedChange)="onSubdirSelect($event)">
            @if (subdirectories().length === 0) {
              <div class="p-4 text-center opacity-50 text-xs italic">
                No subdirectories found
              </div>
            } @else {
              @for (subdir of subdirectories(); track subdir) {
                <app-dense-listbox-item [value]="subdir">
                  <div left class="flex items-center gap-2">
                    <span class="material-icons text-xs opacity-40">folder</span>
                    <span class="text-xs font-mono">{{ subdir }}</span>
                  </div>
                </app-dense-listbox-item>
              }
            }
          </app-dense-listbox>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectoryViewerComponent {
  /** The current path being viewed. Can be two-way bound. */
  path = model.required<string>();
  /** Optional base directory to restrict navigation. */
  baseDir = input<string | null>(null);
  /** Label for the base directory. */
  baseDirLabel = input<string | null>(null);

  protected subdirectories = signal<string[]>([]);
  protected loading = signal(false);

  private rpc = inject(RpcService);

  constructor() {
    effect(() => {
      const currentPath = this.path();
      this.fetchSubdirectories(currentPath);
    });
  }

  protected onSubdirSelect(subdir: string | undefined) {
    if (!subdir) return;
    const current = this.path();
    const nextPath = current === '/' ? `/${subdir}` : `${current}/${subdir}`;
    this.path.set(nextPath);
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
    } catch (error) {
      console.error('Failed to fetch subdirectories', error);
      this.subdirectories.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
