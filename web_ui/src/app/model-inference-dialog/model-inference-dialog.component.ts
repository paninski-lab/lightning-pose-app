import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  OnDestroy,
  output,
  signal,
  ViewChild,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SessionService, TaskStreamEvent } from '../session.service';
import { TerminalOutputComponent } from '../terminal-output/terminal-output.component';
import { VideoFileTableComponent } from '../video-import/video-file-table/video-file-table.component';
import { VideoImportStore } from '../video-import/video-import.store';

@Component({
  selector: 'app-model-inference-dialog',
  imports: [FormsModule, VideoFileTableComponent, TerminalOutputComponent],
  templateUrl: './model-inference-dialog.component.html',
  styleUrl: './model-inference-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [VideoImportStore],
})
export class ModelInferenceDialogComponent implements AfterViewInit, OnDestroy {
  modelRelativePath = input<string>('');
  done = output<void>();

  @ViewChild('dlg', { static: true })
  private dlg!: ElementRef<HTMLDialogElement>;

  private sessionService = inject(SessionService);
  private store = inject(VideoImportStore);
  private subs: Subscription[] = [];
  private isDestroyed = false;

  protected isProcessing = this.store.isProcessing;
  protected inferenceRunning = signal<boolean>(false);

  protected items = this.store.items;
  protected allValid = this.store.allValid;
  protected allTranscoded = this.store.allTranscoded;
  protected isMultiview = this.store.isMultiview;

  protected inference = signal<InferenceUiState>({
    status: 'idle',
    progress: 0,
  });
  protected logLines = signal<string[]>([]);

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      try {
        this.dlg?.nativeElement.showModal();
      } catch {}
    });
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
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

  protected addFiles(files: FileList | null) {
    this.store.addFiles(files);
  }
  protected removeAt(idx: number) {
    this.store.removeAt(idx);
  }
  protected clearAll() {
    this.store.clearAll();
  }

  protected async startImport() {
    await this.store.startImport();
  }

  protected startInference() {
    if (this.inferenceRunning()) return;
    const modelRel = this.modelRelativePath();
    if (!modelRel) {
      this.inference.set({
        status: 'error',
        progress: 0,
        error: 'No model selected',
      });
      return;
    }
    const videos = this.items()
      .filter((i) => i.valid)
      .map((i) => `videos/${i.name}`);
    if (videos.length === 0) return;

    this.inferenceRunning.set(true);
    this.logLines.set([]);
    this.inference.set({ status: 'running', progress: 0 });

    this.sessionService
      .inferTask([modelRel], [], videos)
      .then(({ taskId }) => {
        if (this.isDestroyed) return;
        const sub = this.sessionService.streamTaskProgress(taskId).subscribe({
          next: (event: TaskStreamEvent) => {
            if (event.type === 'log') {
              this.logLines.update((lines) => [...lines, ...event.lines]);
              return;
            }
            const st = event;
            const total = st.total ?? 0;
            const completed = st.completed ?? 0;
            const progress =
              total > 0 ? Math.round((completed / total) * 100) : 0;
            let uiStatus: InferenceUiState['status'];
            switch (st.status) {
              case 'RUNNING':
              case 'PENDING':
                uiStatus = 'running';
                break;
              case 'COMPLETED':
                uiStatus = 'done';
                break;
              case 'FAILED':
                uiStatus = 'error';
                break;
              default:
                uiStatus = 'running';
            }
            this.inference.set({
              status: uiStatus,
              progress,
              message: st.message ?? undefined,
              error: st.error ?? undefined,
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
        if (this.isDestroyed) {
          sub.unsubscribe();
        } else {
          this.subs.push(sub);
        }
      })
      .catch((err) => {
        if (this.isDestroyed) return;
        this.inferenceRunning.set(false);
        this.inference.set({
          status: 'error',
          progress: 0,
          error: err?.message ?? 'Failed to start inference',
        });
      });
  }
}

interface InferenceUiState {
  status: 'idle' | 'running' | 'done' | 'error';
  progress: number;
  error?: string;
  message?: string;
  taskId?: string;
}
