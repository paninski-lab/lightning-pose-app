import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { SessionService, VideoTaskStatus } from '../session.service';
import { ProjectInfoService } from '../project-info.service';
import { ParsedItem, TranscodeState, UploadState } from './video-import.types';
import { parseVideoFilename } from './filename';

interface SelectedVideo {
  id: string;
  kind: 'local' | 'server';
  name: string;
  size: number;
  file: File | null;
  serverPath: string | null;
}

@Injectable()
export class VideoImportStore implements OnDestroy {
  private sessionService = inject(SessionService);
  private projectInfoService = inject(ProjectInfoService);

  private subs = new Map<string, Subscription>();
  private isDestroyed = false;

  // Selection + busy flag
  readonly selectedFiles = signal<SelectedVideo[]>([]);
  readonly uploading = signal<boolean>(false);

  readonly isProcessing = computed(() => {
    if (this.uploading()) return true;
    const items = this.items();
    if (items.length === 0) return false;
    return items.some((i) => i.transcode?.status === 'transcoding');
  });

  // Per-file states
  private uploadStates = signal<Record<string, UploadState>>({});
  private transcodeStates = signal<Record<string, TranscodeState>>({});

  readonly isMultiview = computed(() => {
    const views =
      this.projectInfoService.projectContext()?.projectInfo?.views ?? [];
    return views.length > 0;
  });

  // Derived view model of selected files
  readonly items = computed<ParsedItem[]>(() => {
    // touch maps so changes recompute
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _u = this.uploadStates();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _t = this.transcodeStates();
    const items = this.selectedFiles().map((f) => this.toItem(f));

    if (this.isMultiview()) {
      const views =
        this.projectInfoService.projectContext()?.projectInfo?.views ?? [];
      const sessionMap = new Map<string, Set<string>>();

      // Group views by session
      items.forEach((item) => {
        if (item.valid && item.sessionKey && item.view) {
          if (!sessionMap.has(item.sessionKey)) {
            sessionMap.set(item.sessionKey, new Set());
          }
          sessionMap.get(item.sessionKey)!.add(item.view);
        }
      });

      // Check completeness for each session
      items.forEach((item) => {
        if (item.valid && item.sessionKey) {
          const sessionViews = sessionMap.get(item.sessionKey);
          const missing = views.filter((v) => !sessionViews?.has(v));
          if (missing.length > 0) {
            item.valid = false;
            item.error = `Missing views: ${missing.join(', ')}`;
          }
        }
      });
    }

    return items;
  });

  readonly allValid = computed(
    () => this.items().length > 0 && this.items().every((i) => i.valid),
  );

  readonly allTranscoded = computed(
    () =>
      this.items().length > 0 &&
      this.items().every((i) => i.transcode?.status === 'done'),
  );

  // Public API ---------------------------------------------------------------
  addFiles(files: FileList | File[] | null): void {
    if (!files) return;
    const next = [...this.selectedFiles()];
    const len = (files as FileList).length ?? (files as File[]).length;
    for (let i = 0; i < len; i++) {
      const f = (files as FileList).item
        ? (files as FileList).item(i)!
        : (files as File[])[i];
      next.push({
        id: f.name,
        kind: 'local',
        name: f.name,
        size: f.size,
        file: f,
        serverPath: null,
      });
    }
    this.selectedFiles.set(next);
  }

  addServerFiles(
    files: { path: string; name: string; size: number }[],
  ): void {
    const next = [...this.selectedFiles()];
    for (const f of files) {
      if (next.some((s) => s.id === f.path)) continue;
      next.push({
        id: f.path,
        kind: 'server',
        name: f.name,
        size: f.size,
        file: null,
        serverPath: f.path,
      });
    }
    this.selectedFiles.set(next);
  }

  removeAt(idx: number): void {
    const next = [...this.selectedFiles()];
    if (idx >= 0 && idx < next.length) {
      const removed = next.splice(idx, 1)[0];
      // Also clear states for cleanliness
      this.clearStatesFor(removed?.id);
      this.selectedFiles.set(next);
    }
  }

  clearAll(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.subs.clear();
    this.selectedFiles.set([]);
    this.uploadStates.set({});
    this.transcodeStates.set({});
  }

  ngOnDestroy() {
    this.isDestroyed = true;
    this.subs.forEach((s) => s.unsubscribe());
    this.subs.clear();
  }

  async startImport(): Promise<void> {
    const queue = this.items().filter((i) => i.valid);
    if (queue.length === 0) return;
    this.uploading.set(true);

    const runNext = async (index: number) => {
      if (index >= queue.length) {
        this.uploading.set(false);
        return;
      }
      const it = queue[index];

      if (it.kind === 'server' && it.serverPath) {
        this.startTranscode(it.id, it.serverPath);
        return runNext(index + 1);
      }

      // If already exists in uploads, skip upload and transcode directly
      try {
        const exists = await this.sessionService.existsInUploads(it.name);
        if (exists) {
          this.setUploadState(it.id, {
            status: 'done',
            progress: 100,
            error: null,
          });
          this.startTranscode(it.id, `uploads://${it.name}`);
          return runNext(index + 1);
        }
      } catch {
        // ignore and proceed to upload attempt
      }

      if (!it.file) {
        this.setUploadState(it.id, {
          status: 'error',
          error: 'Missing local file',
        });
        return runNext(index + 1);
      }

      // Begin upload
      this.setUploadState(it.id, {
        status: 'uploading',
        progress: 0,
        error: null,
      });
      const sub = this.sessionService
        .uploadVideo(it.file, it.name, false)
        .subscribe({
          next: (event: HttpEvent<unknown>) => {
            if (this.isDestroyed) return;
            if (event.type === HttpEventType.UploadProgress) {
              const total =
                event.total && event.total > 0 ? event.total : undefined;
              const loaded = event.loaded ?? 0;
              const pct = total
                ? Math.min(100, Math.round((loaded / total) * 100))
                : undefined;
              this.setUploadState(it.id, {
                status: 'uploading',
                progress: pct ?? this.uploadStates()[it.id]?.progress ?? 0,
                error: null,
              });
            } else if (event.type === HttpEventType.Response) {
              this.subs.get(it.id)?.unsubscribe();
              this.subs.delete(it.id);
              this.setUploadState(it.id, {
                status: 'done',
                progress: 100,
                error: null,
              });
              this.startTranscode(it.id, `uploads://${it.name}`);
              runNext(index + 1);
            }
          },
          error: (err) => {
            this.subs.delete(it.id);
            if (this.isDestroyed) return;
            const msg = err?.error?.detail || err?.message || 'Upload failed';
            this.setUploadState(it.id, { status: 'error', error: msg });
            runNext(index + 1);
          },
        });
      this.subs.set(it.id, sub);
    };

    runNext(0);
  }

  startTranscode(id: string, inputPath: string): void {
    // Start watching transcoding via SSE
    this.setTranscodeState(id, {
      status: 'transcoding',
      progress: 0,
      error: null,
    });
    this.subs.get(id)?.unsubscribe();
    const sub = this.sessionService
      .transcodeVideoSse(inputPath, false)
      .subscribe({
        next: (e: VideoTaskStatus) => {
          if (this.isDestroyed) return;
          const total = e.totalFrames ?? 0;
          const done = e.framesDone ?? 0;
          const progress = total > 0 ? Math.round((done / total) * 100) : 0;
          if (e.transcodeStatus === 'ERROR') {
            this.subs.delete(id);
            this.setTranscodeState(id, {
              status: 'error',
              error: e.error ?? 'Transcode error',
            });
          } else if (e.transcodeStatus === 'DONE') {
            this.subs.delete(id);
            this.setTranscodeState(id, {
              status: 'done',
              progress: 100,
              error: null,
            });
          } else {
            this.setTranscodeState(id, {
              status: 'transcoding',
              progress,
              error: null,
            });
          }
        },
        error: (err) => {
          this.subs.delete(id);
          if (this.isDestroyed) return;
          const msg =
            err?.error?.detail || err?.message || 'Transcode stream error';
          this.setTranscodeState(id, { status: 'error', error: msg });
        },
      });
    this.subs.set(id, sub);
  }

  // Internals ----------------------------------------------------------------
  private toItem(selected: SelectedVideo): ParsedItem {
    const views =
      this.projectInfoService.projectContext()?.projectInfo?.views ?? [];
    const parsed = parseVideoFilename(selected.name, {
      isMultiview: views.length > 0,
      views,
    });

    return {
      id: selected.id,
      kind: selected.kind,
      file: selected.file,
      serverPath: selected.serverPath,
      size: selected.size,
      name: selected.name,
      ext: parsed.ext ?? '',
      sessionKey: parsed.sessionKey,
      view: parsed.view,
      error: parsed.error,
      valid: parsed.error === null,
      upload: this.uploadStates()[selected.id] ?? null,
      transcode: this.transcodeStates()[selected.id] ?? null,
    };
  }

  private setUploadState(name: string, state: UploadState) {
    const next = { ...this.uploadStates() };
    next[name] = state;
    this.uploadStates.set(next);
  }

  private setTranscodeState(name: string, state: TranscodeState) {
    const next = { ...this.transcodeStates() };
    next[name] = state;
    this.transcodeStates.set(next);
  }

  private clearStatesFor(name?: string) {
    if (!name) return;
    const u = { ...this.uploadStates() };
    const t = { ...this.transcodeStates() };
    delete u[name];
    delete t[name];
    this.uploadStates.set(u);
    this.transcodeStates.set(t);
  }
}
