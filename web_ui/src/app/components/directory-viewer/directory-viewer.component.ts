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

import { ProjectInfoService } from '../../project-info.service';

interface RGlobResponse {
  entries: { path: string; type?: 'dir' | 'file' }[];
  relativeTo: string;
}

export type FileFilter = 'dir' | 'video' | 'csv' | 'all';

interface Entry {
  name: string;
  type: 'dir' | 'file';
  icon: string;
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
          <app-dense-listbox (selectedChange)="onEntrySelect($event)">
            @if (entries().length === 0) {
              <div class="p-4 text-center opacity-50 text-xs italic">
                @if (fileFilter() === 'dir') {
                  No subdirectories found
                } @else {
                  No entries found
                }
              </div>
            } @else {
              @for (entry of entries(); track entry.name) {
                <app-dense-listbox-item [value]="entry">
                  <div left class="flex items-center gap-2">
                    <span class="material-icons text-xs opacity-40">{{
                      entry.icon
                    }}</span>
                    <span class="text-xs font-mono">{{ entry.name }}</span>
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
  private rpc = inject(RpcService);
  private projectInfoService = inject(ProjectInfoService);

  /** The current path being viewed. Can be two-way bound. */
  path = model.required<string>();
  /** Optional base directory to restrict navigation. */
  baseDir = input<string | null>(null);
  /** Label for the base directory. */
  baseDirLabel = input<string | null>(null);
  /** Filter for what entries to show. */
  fileFilter = input<FileFilter>('dir');
  /** Whether to group files by multiview session. Defaults based on project info. */
  isMultiview = input<boolean>(
    (this.projectInfoService.projectInfo?.views?.length ?? 0) > 1,
  );

  protected entries = signal<Entry[]>([]);
  protected loading = signal(false);

  constructor() {
    effect(() => {
      const currentPath = this.path();
      // Ensure we re-fetch when mode or multiview changes
      this.fileFilter();
      this.isMultiview();
      this.fetchEntries(currentPath);
    });
  }

  protected onEntrySelect(entry: Entry | undefined) {
    if (!entry || entry.type === 'file') return;
    const current = this.path();
    const nextPath =
      current === '/' ? `/${entry.name}` : `${current}/${entry.name}`;
    this.path.set(nextPath);
  }

  private isVideo(filename: string): boolean {
    const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
    return videoExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
  }

  private isCsv(filename: string): boolean {
    return filename.toLowerCase().endsWith('.csv');
  }

  private getGroupedPath(path: string, views: string[]): string {
    const parts = path.split('/');
    const filename = parts.at(-1)!;
    const viewName = views.find((v) => filename.includes(v));

    if (!viewName) {
      return path;
    }

    const groupedFilename = filename.replace(viewName, '*');
    return [...parts.slice(0, -1), groupedFilename].join('/');
  }

  private async fetchEntries(basePath: string) {
    this.loading.set(true);
    try {
      const response = (await this.rpc.call('rglob', {
        baseDir: basePath,
        pattern: '*',
        noDirs: false,
        stat: true,
      })) as RGlobResponse;

      const filter = this.fileFilter();
      const isMultiview = this.isMultiview();
      const views = this.projectInfoService.projectInfo?.views || [];

      const filtered = response.entries.filter((e) => {
        if (e.type === 'dir') return true;
        if (filter === 'all') return true;
        if (filter === 'video' && this.isVideo(e.path)) return true;
        if (filter === 'csv' && this.isCsv(e.path)) return true;
        return false;
      });

      const resultEntries: Entry[] = [];
      const seenGroupNames = new Set<string>();

      for (const e of filtered) {
        if (e.type === 'dir') {
          resultEntries.push({
            name: e.path,
            type: 'dir',
            icon: 'folder',
          });
          continue;
        }

        let displayName = e.path;
        if (isMultiview) {
          displayName = this.getGroupedPath(e.path, views);
        }

        if (seenGroupNames.has(displayName)) {
          continue;
        }
        if (displayName.includes('*')) {
          seenGroupNames.add(displayName);
        }

        let icon = 'insert_drive_file';
        if (this.isVideo(displayName)) {
          icon = 'videocam';
        } else if (this.isCsv(displayName)) {
          icon = 'description';
        }

        resultEntries.push({
          name: displayName,
          type: (e.type as 'dir' | 'file') || 'file',
          icon,
        });
      }

      this.entries.set(resultEntries);
    } catch (error) {
      console.error('Failed to fetch entries', error);
      this.entries.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
