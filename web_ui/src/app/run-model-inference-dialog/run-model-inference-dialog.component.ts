import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  InferenceTaskStatus,
  ResolveInferenceResponse,
  SessionService,
} from '../session.service';
import { ModelListResponseEntry } from '../modelconf';

@Component({
  selector: 'app-run-model-inference-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './run-model-inference-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunModelInferenceDialogComponent implements OnInit, OnDestroy {
  close = output<void>();

  private sessionService = inject(SessionService);
  private subs: Subscription[] = [];

  protected models = signal<ModelListResponseEntry[]>([]);
  protected modelsLoading = signal(false);
  protected selectedPaths = signal<Set<string>>(new Set());

  protected resolveResult = signal<ResolveInferenceResponse | null>(null);
  protected resolveLoading = signal(false);
  protected resolveError = signal<string | null>(null);

  protected inferState = signal<InferUiState>({ status: 'idle', progress: 0 });

  protected get inferenceRunning() {
    return this.inferState().status === 'running';
  }

  async ngOnInit() {
    await this.loadModels();
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
  }

  private async loadModels() {
    this.modelsLoading.set(true);
    try {
      const resp = await this.sessionService.listModels();
      this.models.set(resp.models);
      this.selectedPaths.set(new Set(resp.models.map((m) => m.model_relative_path)));
      await this.loadResolvePreview();
    } finally {
      this.modelsLoading.set(false);
    }
  }

  protected async toggleModel(path: string) {
    const current = new Set(this.selectedPaths());
    if (current.has(path)) {
      current.delete(path);
    } else {
      current.add(path);
    }
    this.selectedPaths.set(current);
    await this.loadResolvePreview();
  }

  protected isSelected(path: string) {
    return this.selectedPaths().has(path);
  }

  private async loadResolvePreview() {
    const selected = Array.from(this.selectedPaths());
    if (selected.length === 0) {
      this.resolveResult.set(null);
      this.resolveError.set(null);
      return;
    }
    this.resolveLoading.set(true);
    this.resolveError.set(null);
    try {
      const result = await this.sessionService.resolveInference(selected, ['all']);
      this.resolveResult.set(result);
    } catch {
      this.resolveResult.set(null);
      this.resolveError.set('Could not load preview.');
    } finally {
      this.resolveLoading.set(false);
    }
  }

  protected async startInference() {
    if (this.inferenceRunning) return;
    const selected = Array.from(this.selectedPaths());
    if (selected.length === 0) return;

    this.inferState.set({ status: 'running', progress: 0 });
    try {
      const { taskId } = await this.sessionService.inferTask(selected, ['all']);
      const sub = this.sessionService.streamTaskProgress(taskId).subscribe({
        next: (st: InferenceTaskStatus) => {
          const total = st.total ?? 0;
          const completed = st.completed ?? 0;
          const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
          const status =
            st.status === 'COMPLETED'
              ? 'done'
              : st.status === 'FAILED'
                ? 'error'
                : 'running';
          this.inferState.set({
            status,
            progress,
            message: st.message ?? undefined,
            error: st.error ?? undefined,
          });
        },
        error: (err: Error) => {
          this.inferState.set({
            status: 'error',
            progress: 0,
            error: err.message ?? 'Inference stream error',
          });
        },
        complete: () => {
          const cur = this.inferState();
          if (cur.status !== 'error') {
            this.inferState.set({ ...cur, status: 'done', progress: 100 });
          }
        },
      });
      this.subs.push(sub);
    } catch (err: any) {
      this.inferState.set({
        status: 'error',
        progress: 0,
        error: err?.message ?? 'Failed to start inference',
      });
    }
  }

  @HostListener('window:keydown.escape')
  onEscape() {
    if (!this.inferenceRunning) {
      this.close.emit();
    }
  }

  handleCloseClick() {
    this.close.emit();
  }
}

interface InferUiState {
  status: 'idle' | 'running' | 'done' | 'error';
  progress: number;
  message?: string;
  error?: string;
}
