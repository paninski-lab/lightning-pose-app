import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { RpcService } from '../../rpc.service';
import { ProjectInfoService } from '../../project-info.service';
import { PathBarComponent } from '../path-bar/path-bar.component';
import { DenseListboxComponent } from '../dense-listbox/dense-listbox.component';
import { DenseListboxItemComponent } from '../dense-listbox/dense-listbox-item.component';

const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];

export interface ServerVideoChoice {
  path: string;
  name: string;
  size: number;
}

interface ListedEntry {
  name: string;
  path: string;
  type: 'dir' | 'file';
  size: number;
  icon: string;
}

interface RGlobResponse {
  entries: { path: string; type?: 'dir' | 'file'; size?: number | null }[];
  relativeTo: string;
}

@Component({
  selector: 'app-server-video-picker',
  standalone: true,
  imports: [
    PathBarComponent,
    DenseListboxComponent,
    DenseListboxItemComponent,
  ],
  templateUrl: './server-video-picker.component.html',
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 16rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServerVideoPickerComponent {
  chosen = output<ServerVideoChoice[]>();
  dismissed = output<void>();

  private rpc = inject(RpcService);
  private projectInfo = inject(ProjectInfoService);

  protected path = signal(this.initialPath());
  protected entries = signal<ListedEntry[]>([]);
  protected loading = signal(false);
  protected listSelection = signal<ListedEntry | undefined>(undefined);
  protected picked = signal<Map<string, ServerVideoChoice>>(new Map());

  protected baseDir = computed(() => this.browseRoot());
  protected pickedCount = computed(() => this.picked().size);

  constructor() {
    effect(() => {
      const current = this.path();
      if (current) {
        void this.fetchEntries(current);
      }
    });
  }

  protected isPicked(entry: ListedEntry): boolean {
    return this.picked().has(entry.path);
  }

  protected onPathChange(next: string) {
    const root = this.browseRoot();
    if (root && !next.startsWith(root)) {
      this.path.set(root);
      return;
    }
    this.path.set(next);
  }

  protected onPick(entry: ListedEntry | undefined) {
    this.listSelection.set(undefined);
    if (!entry) return;
    if (entry.type === 'dir') {
      const current = this.path();
      const next =
        current === '/' ? `/${entry.name}` : `${current}/${entry.name}`;
      this.onPathChange(next);
      return;
    }
    this.picked.update((map) => {
      const next = new Map(map);
      if (next.has(entry.path)) {
        next.delete(entry.path);
      } else {
        next.set(entry.path, {
          path: entry.path,
          name: entry.name,
          size: entry.size,
        });
      }
      return next;
    });
  }

  protected confirm() {
    this.chosen.emit([...this.picked().values()]);
  }

  protected dismiss() {
    this.dismissed.emit();
  }

  private initialPath(): string {
    return (
      this.projectInfo.projectContext()?.projectInfo?.data_dir ||
      this.projectInfo.globalContext()?.homeDir ||
      '/'
    );
  }

  private browseRoot(): string | null {
    const home = this.projectInfo.globalContext()?.homeDir ?? null;
    const data = this.projectInfo.projectContext()?.projectInfo?.data_dir;
    if (home && data && data.startsWith(home)) return home;
    if (home && !data) return home;
    return data ?? home;
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

      const listed: ListedEntry[] = [];
      for (const entry of response.entries) {
        const name = String(entry.path);
        if (entry.type === 'dir') {
          listed.push({
            name,
            path: joinPath(basePath, name),
            type: 'dir',
            size: 0,
            icon: 'folder',
          });
          continue;
        }
        if (!isVideoName(name)) continue;
        listed.push({
          name,
          path: joinPath(basePath, name),
          type: 'file',
          size: entry.size ?? 0,
          icon: 'videocam',
        });
      }
      this.entries.set(listed);
    } catch (error) {
      console.error('Failed to list server videos', error);
      this.entries.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}

function joinPath(dir: string, name: string): string {
  if (dir === '/') return `/${name}`;
  return `${dir.replace(/\/$/, '')}/${name}`;
}

function isVideoName(filename: string): boolean {
  const lower = filename.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
