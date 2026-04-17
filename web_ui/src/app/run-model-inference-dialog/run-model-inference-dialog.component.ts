import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
  TaskStreamEvent,
} from '../session.service';
import { ModelListResponseEntry } from '../modelconf';
import { TerminalOutputComponent } from '../terminal-output/terminal-output.component';
import { ProjectInfoService } from '../project-info.service';

@Component({
  selector: 'app-run-model-inference-dialog',
  standalone: true,
  imports: [FormsModule, TerminalOutputComponent],
  templateUrl: './run-model-inference-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunModelInferenceDialogComponent implements OnInit, OnDestroy {
  close = output<void>();

  private sessionService = inject(SessionService);
  private projectInfoService = inject(ProjectInfoService);
  private subs: Subscription[] = [];

  protected models = signal<ModelListResponseEntry[]>([]);

  protected eksValidationError = computed(() => {
    const ctx = this.projectInfoService.globalContext();
    const eksInstalled = ctx?.versions['ensemble-kalman-smoother'] != null;
    if (eksInstalled) return null;
    const selected = this.selectedPaths();
    const hasEksModel = this.models().some(
      (m) => m.model_kind === 'eks' && selected.has(m.model_relative_path),
    );
    return hasEksModel
      ? 'EKS models require the ensemble-kalman-smoother package. Run "pip install ensemble-kalman-smoother" to enable inference.'
      : null;
  });
  protected modelsLoading = signal(false);
  protected selectedPaths = signal<Set<string>>(new Set());

  protected resolveResult = signal<ResolveInferenceResponse | null>(null);
  protected resolveLoading = signal(false);
  protected resolveError = signal<string | null>(null);

  protected inferState = signal<InferUiState>({ status: 'idle', progress: 0 });
  protected logLines = signal<string[]>([]);
  protected currentTaskId = signal<string | null>(null);

  protected get inferenceRunning() {
    return this.inferState().status === 'running';
  }

  protected get showTerminal() {
    const s = this.inferState().status;
    return s !== 'idle';
  }

  async ngOnInit() {
    await this.loadModels();
    await this.reconnectActiveTask();
  }

  ngOnDestroy() {
    this.subs.forEach((s) => s.unsubscribe());
  }

  private async reconnectActiveTask() {
    try {
      const { taskId } = await this.sessionService.getActiveInferenceTask();
      if (!taskId) return;

      const status = await this.sessionService.getInferenceTaskStatus(taskId);
      if (status.logs && status.logs.length > 0) {
        this.logLines.set(status.logs);
      }

      this.currentTaskId.set(taskId);
      const uiStatus = this.toUiStatus(status.status);
      const total = status.total ?? 0;
      const completed = status.completed ?? 0;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
      this.inferState.set({
        status: uiStatus,
        progress,
        message: status.message ?? undefined,
        error: status.error ?? undefined,
      });

      if (uiStatus === 'running') {
        this.subscribeToStream(taskId);
      }
    } catch {
      // Non-critical — ignore reconnect failures
    }
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

    this.logLines.set([]);
    this.currentTaskId.set(null);
    this.inferState.set({ status: 'running', progress: 0 });
    try {
      const { taskId } = await this.sessionService.inferTask(selected, ['all']);
      this.currentTaskId.set(taskId);
      this.subscribeToStream(taskId);
    } catch (err: any) {
      this.inferState.set({
        status: 'error',
        progress: 0,
        error: err?.message ?? 'Failed to start inference',
      });
    }
  }

  private subscribeToStream(taskId: string) {
    const sub = this.sessionService.streamTaskProgress(taskId).subscribe({
      next: (event: TaskStreamEvent) => {
        if (event.type === 'log') {
          this.logLines.update((lines) => [...lines, ...event.lines]);
        } else {
          const total = event.total ?? 0;
          const completed = event.completed ?? 0;
          const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
          this.inferState.set({
            status: this.toUiStatus(event.status),
            progress,
            message: event.message ?? undefined,
            error: event.error ?? undefined,
          });
        }
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
        if (cur.status !== 'error' && cur.status !== 'cancelled') {
          this.inferState.set({ ...cur, status: 'done', progress: 100 });
        }
      },
    });
    this.subs.push(sub);
  }

  private toUiStatus(status: string): InferUiState['status'] {
    switch (status) {
      case 'COMPLETED':
        return 'done';
      case 'FAILED':
        return 'error';
      case 'CANCELLED':
        return 'cancelled';
      case 'RUNNING':
      case 'WAITING':
      case 'PENDING':
        return 'running';
      default:
        return 'running';
    }
  }

  @HostListener('window:keydown.escape')
  onEscape() {
    if (!this.inferenceRunning) {
      this.close.emit();
    }
  }

  protected handleCloseClick() {
    this.close.emit();
  }

  protected async cancelTask() {
    const taskId = this.currentTaskId();
    if (!taskId) return;
    try {
      await this.sessionService.cancelInferenceTask(taskId);
    } catch {
      // best-effort
    }
  }
}

interface InferUiState {
  status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  progress: number;
  message?: string;
  error?: string;
}
