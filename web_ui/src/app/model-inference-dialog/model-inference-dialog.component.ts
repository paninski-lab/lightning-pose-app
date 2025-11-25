import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-model-inference-dialog',
  imports: [CommonModule, FormsModule],
  templateUrl: './model-inference-dialog.component.html',
  styleUrl: './model-inference-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelInferenceDialogComponent implements AfterViewInit, OnDestroy {
  // Inputs/outputs
  modelRelativePath = input<string>('');
  done = output<void>();

  @ViewChild('dlg', { static: true })
  private dlg!: ElementRef<HTMLDialogElement>;

  // Services/subscriptions
  private sessionService = inject(SessionService);
  private subs: Subscription[] = [];

  // Local state
  protected selectedFiles = signal<File[]>([]);
  protected uploading = signal<boolean>(false);
  protected inferenceRunning = signal<boolean>(false);

  private uploadStates = signal<Record<string, UploadState>>({});
  private transcodeStates = signal<Record<string, TranscodeState>>({});

  protected items = computed(() => {
    // Depend on upload/transcode states so UI updates when they change
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _u = this.uploadStates();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _t = this.transcodeStates();
    return this.selectedFiles().map((file) => this.toItem(file));
  });

  protected allValid = computed(
    () => this.items().length > 0 && this.items().every((i) => i.valid),
  );

  protected allTranscoded = computed(
    () =>
      this.items().length > 0 &&
      this.items().every((i) => i.transcode?.status === 'done'),
  );

  // Inference status
  protected inference = signal<InferenceUiState>({
    status: 'idle',
    progress: 0,
  });

  // Dialog lifecycle
  ngAfterViewInit(): void {
    queueMicrotask(() => {
      try {
        this.dlg?.nativeElement.showModal();
      } catch {}
    });
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  protected closeDialog() {
    try {
      if (this.dlg?.nativeElement.open) {
        this.dlg.nativeElement.close();
      }
    } finally {
      this.done.emit();
    }
  }

  // UI helpers
  protected formatBytes(n: number): string {
    if (!Number.isFinite(n) || n < 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let idx = 0;
    let val = n;
    while (val >= 1024 && idx < units.length - 1) {
      val /= 1024;
      idx++;
    }
    return `${val.toFixed(val < 10 && idx > 0 ? 1 : 0)} ${units[idx]}`;
  }

  // File selection
  protected addFiles(files: FileList | null) {
    if (!files) return;
    const current = this.selectedFiles();
    const next: File[] = [...current];
    for (let i = 0; i < files.length; i++) {
      next.push(files.item(i)!);
    }
    this.selectedFiles.set(next);
  }
  protected removeAt(idx: number) {
    const next = [...this.selectedFiles()];
    next.splice(idx, 1);
    this.selectedFiles.set(next);
  }
  protected clearAll() {
    this.selectedFiles.set([]);
  }

  // Parsing and validation (same rules as session import)
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
      upload: this.uploadStateFor(file.name),
      transcode: this.transcodeStateFor(file.name),
    };
  }

  private setUploadState(name: string, state: UploadState) {
    const next = { ...this.uploadStates() };
    next[name] = state;
    this.uploadStates.set(next);
  }
  private uploadStateFor(name: string): UploadState | null {
    return this.uploadStates()[name] ?? null;
  }
  private setTranscodeState(name: string, state: TranscodeState) {
    const next = { ...this.transcodeStates() };
    next[name] = state;
    this.transcodeStates.set(next);
  }
  private transcodeStateFor(name: string): TranscodeState | null {
    return this.transcodeStates()[name] ?? null;
  }

  // Import flow: upload and transcode sequentially
  protected async startImport() {
    const queue = this.items().filter((i) => i.valid);
    if (queue.length === 0) return;
    this.uploading.set(true);

    const runNext = async (index: number) => {
      if (index >= queue.length) {
        this.uploading.set(false);
        return;
      }
      const it = queue[index];

      // Check if already uploaded
      try {
        const exists = await this.sessionService.existsInUploads(it.name);
        if (exists) {
          this.setUploadState(it.name, {
            status: 'done',
            progress: 100,
            error: null,
          });
          this.startTranscode(it.name);
          runNext(index + 1);
          return;
        }
      } catch {}

      // Init upload state and perform upload
      this.setUploadState(it.name, {
        status: 'uploading',
        progress: 0,
        error: null,
      });
      const sub = this.sessionService
        .uploadVideo(it.file, it.name, false)
        .subscribe({
          next: (event: HttpEvent<unknown>) => {
            if (event.type === HttpEventType.UploadProgress) {
              const total = (event.total ?? 0) > 0 ? event.total! : undefined;
              const progress = total
                ? Math.round(((event.loaded ?? 0) / total) * 100)
                : 0;
              this.setUploadState(it.name, {
                status: 'uploading',
                progress,
                error: null,
              });
            } else if (event.type === HttpEventType.Response) {
              this.setUploadState(it.name, {
                status: 'done',
                progress: 100,
                error: null,
              });
              // Start transcode immediately
              this.startTranscode(it.name);
              // Move to next item
              runNext(index + 1);
            }
          },
          error: (err) => {
            this.setUploadState(it.name, {
              status: 'error',
              progress: 0,
              error: err?.message ?? 'Upload failed',
            });
            // Continue with next file
            runNext(index + 1);
          },
        });
      this.subs.push(sub);
    };

    runNext(0);
  }

  private startTranscode(filename: string) {
    this.setTranscodeState(filename, {
      status: 'transcoding',
      progress: 0,
      error: null,
    });
    const sub = this.sessionService.transcodeVideoSse(filename, false).subscribe({
      next: (e) => {
        if (e.transcodeStatus === 'ERROR') {
          this.setTranscodeState(filename, {
            status: 'error',
            progress: 0,
            error: e.error ?? 'Transcode failed',
          });
        } else if (e.transcodeStatus === 'DONE') {
          this.setTranscodeState(filename, {
            status: 'done',
            progress: 100,
            error: null,
          });
        } else if (e.transcodeStatus === 'ACTIVE') {
          const total = e.totalFrames ?? 0;
          const done = e.framesDone ?? 0;
          const progress = total > 0 ? Math.round((done / total) * 100) : 0;
          this.setTranscodeState(filename, {
            status: 'transcoding',
            progress,
            error: null,
          });
        }
      },
      error: (err) => {
        this.setTranscodeState(filename, {
          status: 'error',
          progress: 0,
          error: err?.message ?? 'Transcode stream error',
        });
      },
    });
    this.subs.push(sub);
  }

  protected startInference() {
    if (this.inferenceRunning()) return;
    const modelRel = this.modelRelativePath();
    if (!modelRel) {
      this.inference.set({ status: 'error', progress: 0, error: 'No model selected' });
      return;
    }
    const videos = this.items()
      .filter((i) => i.valid)
      .map((i) => `videos/${i.name}`);
    if (videos.length === 0) return;

    this.inferenceRunning.set(true);
    this.inference.set({ status: 'running', progress: 0 });
    const sub = this.sessionService
      .inferModelSse(modelRel, videos)
      .subscribe({
        next: (st) => {
          const total = st.total ?? 0;
          const completed = st.completed ?? 0;
          const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
          this.inference.set({
            status: (st.status?.toLowerCase() as any) ?? 'running',
            progress,
            message: st.message ?? undefined,
            taskId: st.taskId,
          });
        },
        error: (err) => {
          this.inferenceRunning.set(false);
          this.inference.set({
            status: 'error',
            progress: 0,
            error: err?.message ?? 'Inference stream error',
          });
        },
        complete: () => {
          this.inferenceRunning.set(false);
          const cur = this.inference();
          if (cur.status !== 'error') {
            this.inference.set({ ...cur, status: 'done', progress: 100 });
          }
        },
      });
    this.subs.push(sub);
  }
}

// Local types
type UploadState =
  | { status: 'uploading'; progress: number; error: string | null }
  | { status: 'done'; progress: number; error: string | null }
  | { status: 'error'; progress: number; error: string | null };

type TranscodeState =
  | { status: 'transcoding'; progress: number; error: string | null }
  | { status: 'done'; progress: number; error: string | null }
  | { status: 'error'; progress: number; error: string | null };

interface ParsedItem {
  file: File;
  name: string;
  size: number;
  ext: string;
  sessionKey: string | null;
  view: string | null;
  valid: boolean;
  error: string | null;
  upload: UploadState | null;
  transcode: TranscodeState | null;
}

interface InferenceUiState {
  status: 'idle' | 'running' | 'done' | 'error';
  progress: number; // 0-100
  error?: string;
  message?: string;
  taskId?: string;
}

function splitExtension(filename: string): { baseName: string; ext: string | null } {
  const idx = filename.lastIndexOf('.');
  if (idx === -1) return { baseName: filename, ext: null };
  return { baseName: filename.substring(0, idx), ext: filename.substring(idx + 1) };
}
