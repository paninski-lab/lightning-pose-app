import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ProjectInfoService } from '../../project-info.service';
import { RpcService } from '../../rpc.service';
import { SessionService, VideoTaskStatus } from '../../session.service';
import { ToastService } from '../../toast.service';
import { SessionImportComponent } from '../../session-import/session-import.component';
import { parseVideoFilename } from '../../video-import/filename';
import {
  isProjectVideoDir,
  PROJECT_VIDEO_TREE_GLOB,
} from '../../project-video-paths';
import {
  AlertDialogComponent,
  AlertFooterComponent,
  AlertHeaderComponent,
} from '../../components/alert-dialog/alert-dialog.component';

const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
type AllIntraState = 'unknown' | 'yes' | 'no' | 'needs-conversion' | 'checking';

interface VideoDir {
  name: string;
  ignored: boolean;
}

interface ProjectVideoRow {
  path: string;
  folder: string;
  displayName: string;
  filename: string;
  nameError: string | null;
  nameWarning: string | null;
  allIntra: AllIntraState;
  progress: number | null;
  taskError: string | null;
}

interface RGlobResponse {
  entries: { path: string; type?: 'dir' | 'file' }[];
  relativeTo: string;
}

@Component({
  selector: 'app-project-videos',
  standalone: true,
  imports: [
    FormsModule,
    AlertDialogComponent,
    AlertHeaderComponent,
    AlertFooterComponent,
    SessionImportComponent,
  ],
  templateUrl: './project-videos.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectVideosComponent implements OnInit {
  private projectInfo = inject(ProjectInfoService);
  private rpc = inject(RpcService);
  private sessionService = inject(SessionService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  protected rows = signal<ProjectVideoRow[]>([]);
  protected videoDirs = signal<VideoDir[]>([]);
  protected loading = signal(false);
  protected busy = signal(false);
  protected dirsBusy = signal(false);
  protected selectedPath = signal<string | null>(null);
  protected renameOpen = signal(false);
  protected renameValue = signal('');
  protected importOpen = signal(false);
  protected processAllConfirm = signal(false);

  protected selectedRow = computed(() => {
    const path = this.selectedPath();
    return this.rows().find((row) => row.path === path) ?? null;
  });

  protected renameProblem = computed(() => {
    const parsed = parseVideoFilename(this.renameValue().trim(), {
      isMultiview: this.isMultiview(),
      views: this.viewNames(),
    });
    return parsed.error ?? parsed.warning;
  });

  private destroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
    });
  }

  ngOnInit() {
    void this.refresh();
  }

  /** Structural filename error for the current project view setup. */
  nameError(filename: string): string | null {
    return parseVideoFilename(filename, {
      isMultiview: this.isMultiview(),
      views: this.viewNames(),
    }).error;
  }

  protected async refresh() {
    const dataDir = this.projectInfo.projectContext()?.projectInfo?.data_dir;
    if (!dataDir) {
      this.rows.set([]);
      this.videoDirs.set([]);
      return;
    }
    this.loading.set(true);
    try {
      const [response, top] = await Promise.all([
        this.listVideos(dataDir),
        this.listVideoDirs(dataDir),
      ]);
      const ignored = this.ignoredNames();
      this.videoDirs.set(
        top
          .filter(
            (entry) =>
              entry.type === 'dir' && isProjectVideoDir(String(entry.path)),
          )
          .map((entry) => ({
            name: String(entry.path),
            ignored: ignored.has(String(entry.path)),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      const next = response.entries
        .map((entry) => this.toRow(dataDir, String(entry.path)))
        .filter((row): row is ProjectVideoRow => row !== null)
        .sort((a, b) =>
          `${a.folder}/${a.displayName}`.localeCompare(
            `${b.folder}/${b.displayName}`,
          ),
        );
      this.rows.set(next);
      if (!next.some((row) => row.path === this.selectedPath())) {
        this.selectedPath.set(null);
      }
    } catch (err) {
      this.toast.showToast({
        content: errorMessage(err, 'Could not list videos'),
        variant: 'error',
      });
    } finally {
      this.loading.set(false);
    }
  }

  protected select(path: string) {
    this.selectedPath.set(path);
  }

  protected async toggleVideoDir(name: string, ignored: boolean, event: Event) {
    event.preventDefault();
    if (this.dirsBusy() || this.loading() || this.busy()) return;
    const key = this.projectInfo.projectContext()?.key;
    if (!key) return;
    const next = new Set(this.ignoredNames());
    if (ignored) next.delete(name);
    else next.add(name);
    this.dirsBusy.set(true);
    try {
      await this.rpc.call('setIgnoredVideoDirs', {
        projectKey: key,
        ignored: [...next].sort(),
      });
      await this.projectInfo.reloadProjectInfo(key);
      await this.refresh();
    } catch (err) {
      this.toast.showToast({
        content: errorMessage(err, 'Could not update video folders'),
        variant: 'error',
      });
    } finally {
      this.dirsBusy.set(false);
    }
  }

  protected async checkAllEncodings() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      for (const row of [...this.rows()]) {
        if (this.destroyed) return;
        const current = this.rowByPath(row.path);
        if (current) await this.refreshAllIntra(current);
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async checkSelectedEncoding() {
    const row = this.selectedRow();
    if (!row || this.busy()) return;
    this.busy.set(true);
    try {
      await this.refreshAllIntra(row);
    } finally {
      this.busy.set(false);
    }
  }

  protected async processSelected() {
    const row = this.selectedRow();
    if (!row || this.busy()) return;
    if (row.nameError) {
      this.toast.showToast({
        content: 'Rename this file before converting it.',
        variant: 'warning',
      });
      return;
    }
    this.busy.set(true);
    try {
      await this.convertRow(row);
    } finally {
      this.busy.set(false);
    }
  }

  protected askProcessAll() {
    if (this.busy() || this.rows().length === 0) return;
    this.processAllConfirm.set(true);
  }

  protected confirmProcessAll() {
    this.processAllConfirm.set(false);
    void this.processAll();
  }

  protected onImportDone() {
    this.importOpen.set(false);
    void this.refresh();
  }

  protected async processAll() {
    if (this.busy()) return;
    this.busy.set(true);
    let skipped = 0;
    try {
      for (const row of [...this.rows()]) {
        if (this.destroyed) return;
        const current = this.rowByPath(row.path);
        if (!current) continue;
        if (current.nameError) {
          skipped++;
          continue;
        }
        await this.convertRow(current);
      }
      if (skipped > 0) {
        this.toast.showToast({
          content: `Skipped ${skipped} file${skipped === 1 ? '' : 's'} with invalid names. Rename them first.`,
          variant: 'warning',
        });
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected openRename() {
    const row = this.selectedRow();
    if (!row) return;
    this.renameValue.set(row.filename);
    this.renameOpen.set(true);
  }

  protected async confirmRename() {
    const row = this.selectedRow();
    const nextName = this.renameValue().trim();
    if (!row || this.renameProblem() || nextName === row.filename) return;
    try {
      const result = await this.sessionService.renameVideo(row.path, nextName);
      this.renameOpen.set(false);
      this.toast.showToast({ content: 'Renamed video', variant: 'success' });
      await this.refresh();
      this.selectedPath.set(result.path);
    } catch (err) {
      this.toast.showToast({
        content: errorMessage(err, 'Rename failed'),
        variant: 'error',
      });
    }
  }

  private async listVideos(dataDir: string): Promise<RGlobResponse> {
    return (await this.rpc.call('rglob', {
      baseDir: dataDir,
      pattern: PROJECT_VIDEO_TREE_GLOB,
      noDirs: true,
      stat: false,
    })) as RGlobResponse;
  }

  private async listVideoDirs(dataDir: string) {
    const response = (await this.rpc.call('rglob', {
      baseDir: dataDir,
      pattern: 'videos*',
      noDirs: false,
      stat: true,
    })) as RGlobResponse;
    return response.entries;
  }

  private ignoredNames(): Set<string> {
    return new Set(
      this.projectInfo.projectContext()?.projectInfo?.ignored_video_dirs ?? [],
    );
  }

  private async refreshAllIntra(row: ProjectVideoRow): Promise<ProjectVideoRow> {
    if (!row.filename.toLowerCase().endsWith('.mp4')) {
      const next: ProjectVideoRow = { ...row, allIntra: 'needs-conversion' };
      this.replaceRow(next);
      return next;
    }
    this.patch(row.path, { allIntra: 'checking', taskError: null });
    try {
      const info = await this.sessionService.ffprobe(row.path);
      const next: ProjectVideoRow = {
        ...this.rowByPath(row.path)!,
        allIntra: info.is_all_intra ? 'yes' : 'no',
      };
      this.replaceRow(next);
      return next;
    } catch (err) {
      const next: ProjectVideoRow = {
        ...this.rowByPath(row.path)!,
        allIntra: 'unknown',
        taskError: errorMessage(err, 'ffprobe failed'),
      };
      this.replaceRow(next);
      return next;
    }
  }

  private async convertRow(row: ProjectVideoRow): Promise<void> {
    const checked = await this.refreshAllIntra(row);
    if (checked.allIntra === 'yes' || checked.nameError) return;
    this.patch(checked.path, { progress: 0, taskError: null });
    await new Promise<void>((resolve, reject) => {
      const sub: Subscription = this.sessionService
        .transcodeVideoInPlaceSse(checked.path)
        .subscribe({
          next: (event) => {
            this.applyTranscode(checked, event);
          },
          error: (err) => {
            this.patch(checked.path, {
              progress: null,
              taskError: errorMessage(err, 'Transcode failed'),
            });
            reject(err);
          },
          complete: () => {
            sub.unsubscribe();
            resolve();
          },
        });
    });
  }

  private applyTranscode(row: ProjectVideoRow, event: VideoTaskStatus) {
    if (event.transcodeStatus === 'ERROR') {
      this.patch(row.path, {
        progress: null,
        taskError: event.error ?? 'Transcode error',
        allIntra: row.allIntra === 'checking' ? 'unknown' : row.allIntra,
      });
      return;
    }
    if (event.transcodeStatus === 'DONE') {
      this.markConverted(row.path);
      return;
    }
    const total = event.totalFrames ?? 0;
    const done = event.framesDone ?? 0;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    this.patch(row.path, { progress });
  }

  private markConverted(path: string) {
    const row = this.rowByPath(path);
    if (!row) return;
    const filename = row.filename.replace(/\.[^.]+$/, '.mp4');
    const displayName = row.displayName.replace(/\.[^.]+$/, '.mp4');
    const nextPath = path.replace(/\.[^.]+$/, '.mp4');
    const parsed = parseVideoFilename(filename, {
      isMultiview: this.isMultiview(),
      views: this.viewNames(),
    });
    const next: ProjectVideoRow = {
      ...row,
      path: nextPath,
      filename,
      displayName,
      nameError: parsed.error,
      nameWarning: parsed.warning,
      allIntra: 'yes',
      progress: null,
      taskError: null,
    };
    this.rows.update((rows) =>
      rows.map((item) => (item.path === path ? next : item)),
    );
    if (this.selectedPath() === path) {
      this.selectedPath.set(nextPath);
    }
  }

  private toRow(dataDir: string, relative: string): ProjectVideoRow | null {
    const parts = relative.split('/').filter(Boolean);
    const folder = parts[0];
    if (!isProjectVideoDir(folder) || this.ignoredNames().has(folder)) return null;
    const filename = parts[parts.length - 1] ?? '';
    if (!filename || filename.startsWith('.')) return null;
    if (filename.includes('.allintra.tmp.')) return null;
    if (!VIDEO_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext))) {
      return null;
    }
    const parsed = parseVideoFilename(filename, {
      isMultiview: this.isMultiview(),
      views: this.viewNames(),
    });
    const displayName = parts.slice(1).join('/');
    return {
      path: joinPath(dataDir, relative),
      folder,
      displayName,
      filename,
      nameError: parsed.error,
      nameWarning: parsed.warning,
      allIntra: 'unknown',
      progress: null,
      taskError: null,
    };
  }

  private isMultiview(): boolean {
    return this.viewNames().length > 0;
  }

  private viewNames(): string[] {
    return this.projectInfo.projectContext()?.projectInfo?.views ?? [];
  }

  private rowByPath(path: string): ProjectVideoRow | undefined {
    return this.rows().find((row) => row.path === path);
  }

  private replaceRow(next: ProjectVideoRow) {
    this.rows.update((rows) =>
      rows.map((row) => (row.path === next.path ? next : row)),
    );
  }

  private patch(path: string, partial: Partial<ProjectVideoRow>) {
    this.rows.update((rows) =>
      rows.map((row) => (row.path === path ? { ...row, ...partial } : row)),
    );
  }
}

function joinPath(dir: string, relative: string): string {
  return `${dir.replace(/\/$/, '')}/${relative.replace(/^\//, '')}`;
}

function errorMessage(err: unknown, fallback: string): string {
  const detail = (err as { error?: { detail?: string }; message?: string })
    ?.error?.detail;
  if (typeof detail === 'string' && detail) return detail;
  const message = (err as { message?: string })?.message;
  return message || fallback;
}
