import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  InferenceTaskStatus,
  ResolveInferenceResponse,
  SessionService,
  TaskStreamEvent,
} from '../session.service';
import { mc_util, ModelListResponseEntry } from '../modelconf';
import { TerminalOutputComponent } from '../terminal-output/terminal-output.component';
import { ProjectInfoService } from '../project-info.service';
import { SessionImportComponent } from '../session-import/session-import.component';

@Component({
  selector: 'app-run-model-inference-dialog',
  standalone: true,
  imports: [FormsModule, TerminalOutputComponent, SessionImportComponent],
  templateUrl: './run-model-inference-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown.escape)': 'onEscape()',
  },
})
export class RunModelInferenceDialogComponent implements OnInit, OnDestroy {
  close = output<void>();

  private sessionService = inject(SessionService);
  private projectInfoService = inject(ProjectInfoService);
  private destroyRef = inject(DestroyRef);

  private streamSubscription?: Subscription;
  private isDestroyed = false;

  protected models = signal<ModelListResponseEntry[]>([]);
  protected sessionImportOpen = signal(false);

  protected modelKindLabels: Record<string, string> = {
    normal: 'single model',
    eks: 'ensemble',
  };

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

  protected inferenceRunning = computed(
    () => this.inferState().status === 'running',
  );

  protected inferenceActive = computed(() => {
    const s = this.inferState().status;
    return s === 'running' || s === 'waiting';
  });

  protected showTerminal = computed(() => {
    const s = this.inferState().status;
    return s !== 'idle' && s !== 'waiting';
  });

  /** Called when the Session Import dialog finishes/closed. */
  protected async onImportDone() {
    // Close the import dialog UI
    this.sessionImportOpen.set(false);
    // Refresh the sessions list so the table reflects any newly transcoded videos
    try {
      await this.sessionService.loadSessions();
    } catch (e) {
      // Non-fatal: keep UI responsive even if refresh fails
      console.error('Failed to refresh sessions after import dialog closed', e);
    }
  }

  async ngOnInit() {
    await this.loadModels();
    if (this.isDestroyed) return;
    await this.reconnectActiveTask();
  }

  ngOnDestroy() {
    this.isDestroyed = true;
    this.streamSubscription?.unsubscribe();
  }

  private async reconnectActiveTask() {
    try {
      const { taskId } = await this.sessionService.getActiveInferenceTask();
      if (!taskId || this.isDestroyed) return;

      const status = await this.sessionService.getInferenceTaskStatus(taskId);
      if (this.isDestroyed) return;

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

      if (uiStatus === 'running' || uiStatus === 'waiting') {
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
      const completed = resp.models.filter(
        (m) => new mc_util(m).status === 'COMPLETED',
      );
      this.models.set(completed);
      this.selectedPaths.set(
        new Set(completed.map((m) => m.model_relative_path)),
      );
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
      const result = await this.sessionService.resolveInference(selected, [
        'all',
      ]);
      this.resolveResult.set(result);
    } catch {
      this.resolveResult.set(null);
      this.resolveError.set('Could not load preview.');
    } finally {
      this.resolveLoading.set(false);
    }
  }

  protected async startInference() {
    if (this.inferenceActive()) return;
    const selected = Array.from(this.selectedPaths());
    if (selected.length === 0) return;

    this.logLines.set([]);
    this.currentTaskId.set(null);
    this.inferState.set({ status: 'waiting', progress: 0 });
    try {
      const { taskId } = await this.sessionService.inferTask(selected, ['all']);
      if (this.isDestroyed) return;
      this.currentTaskId.set(taskId);
      this.subscribeToStream(taskId);
    } catch (err: any) {
      if (this.isDestroyed) return;
      this.inferState.set({
        status: 'error',
        progress: 0,
        error: err?.message ?? 'Failed to start inference',
      });
    }
  }

  private subscribeToStream(taskId: string) {
    if (this.isDestroyed) return;
    this.streamSubscription?.unsubscribe();
    this.streamSubscription = this.sessionService
      .streamTaskProgress(taskId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event: TaskStreamEvent) => {
          if (event.type === 'log') {
            this.logLines.update((lines) => [...lines, ...event.lines]);
          } else {
            const total = event.total ?? 0;
            const completed = event.completed ?? 0;
            const progress =
              total > 0 ? Math.round((completed / total) * 100) : 0;
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
  }

  private toUiStatus(status: string): InferUiState['status'] {
    switch (status) {
      case 'COMPLETED':
        return 'done';
      case 'FAILED':
        return 'error';
      case 'CANCELLED':
        return 'cancelled';
      case 'WAITING':
      case 'PENDING':
        return 'waiting';
      case 'RUNNING':
        return 'running';
      default:
        return 'running';
    }
  }

  onEscape() {
    if (!this.inferenceActive()) {
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
  status: 'idle' | 'waiting' | 'running' | 'done' | 'error' | 'cancelled';
  progress: number;
  message?: string;
  error?: string;
}
