import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SessionService } from '../session.service';
import { VideoFileTableComponent } from '../video-import/video-file-table/video-file-table.component';
import { VideoImportStore } from '../video-import/video-import.store';

@Component({
  selector: 'app-model-inference-dialog',
  imports: [CommonModule, FormsModule, VideoFileTableComponent],
  templateUrl: './model-inference-dialog.component.html',
  styleUrl: './model-inference-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [VideoImportStore],
})
export class ModelInferenceDialogComponent implements AfterViewInit, OnDestroy {
  // Inputs/outputs
  modelRelativePath = input<string>('');
  done = output<void>();

  @ViewChild('dlg', { static: true })
  private dlg!: ElementRef<HTMLDialogElement>;

  // Services/subscriptions
  private sessionService = inject(SessionService);
  private store = inject(VideoImportStore);
  private subs: Subscription[] = [];

  // Local state
  protected uploading = this.store.uploading;
  protected inferenceRunning = signal<boolean>(false);

  protected items = this.store.items;
  protected allValid = this.store.allValid;
  protected allTranscoded = this.store.allTranscoded;

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

  // File selection
  protected addFiles(files: FileList | null) {
    this.store.addFiles(files);
  }
  protected removeAt(idx: number) {
    this.store.removeAt(idx);
  }
  protected clearAll() {
    this.store.clearAll();
  }

  // Import flow: upload and transcode sequentially
  protected async startImport() {
    await this.store.startImport();
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
          // Map backend status to UI status keys
          const backend = st.status ?? 'ACTIVE';
          let uiStatus: InferenceUiState['status'];
          switch (backend) {
            case 'PENDING':
            case 'ACTIVE':
              uiStatus = 'running';
              break;
            case 'DONE':
              uiStatus = 'done';
              break;
            case 'ERROR':
              uiStatus = 'error';
              break;
            default:
              uiStatus = 'running';
          }
          this.inference.set({
            status: uiStatus,
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
interface InferenceUiState {
  status: 'idle' | 'running' | 'done' | 'error';
  progress: number; // 0-100
  error?: string;
  message?: string;
  taskId?: string;
}
