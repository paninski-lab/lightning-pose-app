import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { SessionService, VideoTaskStatus } from '../session.service';
import { ParsedItem, TranscodeState, UploadState } from './video-import.types';
import { splitExtension } from './filename';

@Injectable()
export class VideoImportStore {
  private sessionService = inject(SessionService);

  // Selection + busy flag
  readonly selectedFiles = signal<File[]>([]);
  readonly uploading = signal<boolean>(false);

  // Per-file states
  private uploadStates = signal<Record<string, UploadState>>({});
  private transcodeStates = signal<Record<string, TranscodeState>>({});

  // Derived view model of selected files
  readonly items = computed<ParsedItem[]>(() => {
    // touch maps so changes recompute
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _u = this.uploadStates();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _t = this.transcodeStates();
    return this.selectedFiles().map((f) => this.toItem(f));
  });

  readonly allValid = computed(() =>
    this.items().length > 0 && this.items().every((i) => i.valid),
  );

  readonly allTranscoded = computed(() =>
    this.items().length > 0 && this.items().every((i) => i.transcode?.status === 'done'),
  );

  // Public API ---------------------------------------------------------------
  addFiles(files: FileList | File[] | null): void {
    if (!files) return;
    const next = [...this.selectedFiles()];
    const len = (files as FileList).length ?? (files as File[]).length;
    for (let i = 0; i < len; i++) {
      const f = (files as any).item ? (files as FileList).item(i)! : (files as File[])[i];
      next.push(f);
    }
    this.selectedFiles.set(next);
  }

  removeAt(idx: number): void {
    const next = [...this.selectedFiles()];
    if (idx >= 0 && idx < next.length) {
      const removed = next.splice(idx, 1)[0];
      // Also clear states for cleanliness
      this.clearStatesFor(removed?.name);
      this.selectedFiles.set(next);
    }
  }

  clearAll(): void {
    this.selectedFiles.set([]);
    this.uploadStates.set({});
    this.transcodeStates.set({});
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

      // If already exists in uploads, skip upload and transcode directly
      try {
        const exists = await this.sessionService.existsInUploads(it.name);
        if (exists) {
          this.setUploadState(it.name, { status: 'done', progress: 100, error: null });
          this.startTranscode(it.name);
          return runNext(index + 1);
        }
      } catch {
        // ignore and proceed to upload attempt
      }

      // Begin upload
      this.setUploadState(it.name, { status: 'uploading', progress: 0, error: null });
      this.sessionService
        .uploadVideo(it.file, it.name, false)
        .subscribe({
          next: (event: HttpEvent<unknown>) => {
            if (event.type === HttpEventType.UploadProgress) {
              const total = event.total && event.total > 0 ? event.total : undefined;
              const loaded = event.loaded ?? 0;
              const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : undefined;
              this.setUploadState(it.name, {
                status: 'uploading',
                progress: pct ?? this.uploadStates()[it.name]?.progress ?? 0,
                error: null,
              });
            } else if (event.type === HttpEventType.Response) {
              this.setUploadState(it.name, { status: 'done', progress: 100, error: null });
              this.startTranscode(it.name);
              runNext(index + 1);
            }
          },
          error: (err) => {
            const msg = err?.error?.detail || err?.message || 'Upload failed';
            this.setUploadState(it.name, { status: 'error', error: msg });
            runNext(index + 1);
          },
        });
    };

    runNext(0);
  }

  startTranscode(filename: string): void {
    // Start watching transcoding via SSE
    this.setTranscodeState(filename, { status: 'transcoding', progress: 0, error: null });
    this.sessionService.transcodeVideoSse(filename, false).subscribe({
      next: (e: VideoTaskStatus) => {
        const total = e.totalFrames ?? 0;
        const done = e.framesDone ?? 0;
        const progress = total > 0 ? Math.round((done / total) * 100) : 0;
        if (e.transcodeStatus === 'ERROR') {
          this.setTranscodeState(filename, { status: 'error', error: e.error ?? 'Transcode error' });
        } else if (e.transcodeStatus === 'DONE') {
          this.setTranscodeState(filename, { status: 'done', progress: 100, error: null });
        } else {
          this.setTranscodeState(filename, { status: 'transcoding', progress, error: null });
        }
      },
      error: (err) => {
        const msg = err?.error?.detail || err?.message || 'Transcode stream error';
        this.setTranscodeState(filename, { status: 'error', error: msg });
      },
    });
  }

  // Internals ----------------------------------------------------------------
  private toItem(file: File): ParsedItem {
    const { baseName, ext } = splitExtension(file.name);
    const allowedChars = /^[a-zA-Z0-9-_]+$/;

    let error: string | null = null;
    let sessionKey: string | null = null;
    let view: string | null = null;

    if (!baseName || !ext) {
      error = 'Filename must include an extension';
    } else if (!allowedChars.test(baseName)) {
      error = 'Filename contains invalid characters';
    } else if (baseName.indexOf('_') === -1) {
      error = 'Filename must be of the form session_view.ext';
    } else {
      const lastUnderscore = baseName.lastIndexOf('_');
      sessionKey = baseName.substring(0, lastUnderscore);
      view = baseName.substring(lastUnderscore + 1);
      if (!sessionKey) {
        error = 'Missing session name before underscore';
      } else if (!view) {
        error = 'Missing view name after underscore';
      } else if (view.includes('_')) {
        error = 'View name must not contain underscore';
      }
    }

    return {
      file,
      size: file.size,
      name: file.name,
      ext: ext ?? '',
      sessionKey,
      view,
      error,
      valid: error === null,
      upload: this.uploadStates()[file.name] ?? null,
      transcode: this.transcodeStates()[file.name] ?? null,
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
