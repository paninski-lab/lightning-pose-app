import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  input,
  OnChanges,
  OnDestroy,
  signal,
} from '@angular/core';
import { ModelListResponseEntry } from '../../modelconf';
import { JsonPipe } from '@angular/common';
import { ProjectInfoService } from '../../project-info.service';
import { ToastService } from '../../toast.service';

@Component({
  selector: 'app-model-detail',
  imports: [JsonPipe],
  templateUrl: './model-detail.component.html',
  styleUrl: './model-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelDetailComponent implements OnChanges, OnDestroy {
  selectedModel = input.required<ModelListResponseEntry | null>();
  activeTab = signal('general');
  logs = signal<{ filename: string; logUrl: string; content: string }[]>([]);
  private projectInfoService = inject(ProjectInfoService);
  private currentController: AbortController | null = null;
  private toast = inject(ToastService);
  private pollInterval?: number;

  ngOnChanges() {
    // Abort any async processes for the previous model
    this.cleanup();

    this.logs.set([]);

    if (!this.selectedModel()) {
      return;
    }

    // Create new abort controller for this model
    this.currentController = new AbortController();

    const basePath = this.getLogBasePath();

    // Initialize logs metadata
    const initialLogs = [
      {
        filename: 'train_stdout.log',
        logUrl: `${basePath}/train_stdout.log`,
        content: '',
      },
      {
        filename: 'train_stderr.log',
        logUrl: `${basePath}/train_stderr.log`,
        content: '',
      },
    ];

    this.logs.set(initialLogs);

    // Start polling
    this.logPollIter({ initial: true });
    this.pollInterval = setInterval(
      () => this.logPollIter(),
      1500,
    ) as unknown as number;
  }

  ngOnDestroy() {
    this.cleanup();
  }

  private cleanup() {
    if (this.currentController) {
      this.currentController.abort();
      this.currentController = null;
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  private logPollIter(options?: { initial: boolean }) {
    // On initial we always fetch. On subsequent polls, only fetch if we're on the logs tab.
    if (!options?.initial && this.activeTab() !== 'logs') return;

    for (const log of this.logs()) {
      this.reloadLog(log);
    }
  }

  private getLogBasePath() {
    const basePath =
      '/app/v0/files/' +
      this.projectInfoService.projectInfo.model_dir +
      '/' +
      this.selectedModel()?.model_relative_path;
    return basePath;
  }

  private reloadLog(logEntry: {
    content: string;
    logUrl: string;
    filename: string;
  }) {
    // If controller is gone, don't fetch
    if (!this.currentController) return;

    fetch(logEntry.logUrl, {
      signal: this.currentController.signal,
    })
      .then((response) => {
        if (response.ok) {
          return response.text();
        } else {
          throw new Error('Failed to fetch log');
        }
      })
      .then((newContent) => {
        this.logs.update((logs) => {
          return logs.map((l) => {
            if (l.filename === logEntry.filename) {
              return { ...l, content: newContent.replaceAll('\r', '\n') };
            } else {
              return l;
            }
          });
        });
      })
      .catch((error: any) => {
        if (error.name === 'AbortError') return;

        // Only show toast if we haven't loaded content yet, or on explicit failure during polling
        // But requirement was "tell which log failed in the toast"
        this.toast.showToast({
          content: `Failed to refresh ${logEntry.filename}`,
          variant: 'error',
        });
        console.error(`Error fetching ${logEntry.filename}:`, error);
      });
  }
}
