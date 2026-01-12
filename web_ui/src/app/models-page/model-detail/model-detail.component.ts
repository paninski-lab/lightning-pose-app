import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnChanges,
  OnDestroy,
  signal,
} from '@angular/core';
import { ModelListResponseEntry } from '../../modelconf';
import { ProjectInfoService } from '../../project-info.service';
import { ToastService } from '../../toast.service';
import { HighlightDirective } from '../../highlight.directive';
import { YamlPipe } from '../../utils/pipes';

@Component({
  selector: 'app-model-detail',
  imports: [HighlightDirective, YamlPipe],
  templateUrl: './model-detail.component.html',
  styleUrl: './model-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelDetailComponent implements OnChanges, OnDestroy {
  selectedModel = input.required<ModelListResponseEntry | null>();
  activeTab = signal('general');
  logs = signal<
    { filename: string; logUrl: string; content: string; nextOffset: number }[]
  >([]);
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
        nextOffset: 0,
      },
      {
        filename: 'train_stderr.log',
        logUrl: `${basePath}/train_stderr.log`,
        content: '',
        nextOffset: 0,
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
    nextOffset: number;
  }) {
    // If controller is gone, don't fetch
    if (!this.currentController) return;

    fetch(logEntry.logUrl, {
      signal: this.currentController.signal,
      headers: {
        Range: `bytes=${logEntry.nextOffset}-`,
      },
    })
      .then(async (response) => {
        if (response.status === 416) {
          throw '_skipPromiseChainSentinelValue';
        }
        if (!response.ok) {
          throw new Error('Failed to fetch log');
        }

        // Parse the Content-Range header to get the total file size
        // Header format: "bytes <start>-<end>/<total>"
        const contentRange = response.headers.get('Content-Range');
        let newOffset = logEntry.nextOffset;

        if (contentRange) {
          const totalSizeMatch = contentRange.match(/\/(\d+)$/);
          if (totalSizeMatch) {
            newOffset = parseInt(totalSizeMatch[1], 10);
          }
        } else if (response.status === 200) {
          // If server returns 200 OK (doesn't support Range), use Content-Length
          newOffset = parseInt(
            response.headers.get('Content-Length') || '0',
            10,
          );
        }

        const text = await response.text();
        return { text, newOffset };
      })
      .then(({ text, newOffset }) => {
        const newContent = text.replaceAll('\r', '\n');
        this.logs.update((logs) => {
          return logs.map((l) => {
            if (l.filename === logEntry.filename) {
              return {
                ...l,
                content: l.content + newContent,
                nextOffset: newOffset,
              };
            } else {
              return l;
            }
          });
        });
      })
      .catch((error: any) => {
        if (error === '_skipPromiseChainSentinelValue') return;
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
