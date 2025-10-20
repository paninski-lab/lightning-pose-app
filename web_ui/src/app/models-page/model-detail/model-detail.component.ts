import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  input,
  OnChanges,
  signal,
} from '@angular/core';
import { ModelListResponseEntry } from '../../modelconf';
import { JsonPipe } from '@angular/common';
import { ProjectInfoService } from '../../project-info.service';

@Component({
  selector: 'app-model-detail',
  imports: [JsonPipe],
  templateUrl: './model-detail.component.html',
  styleUrl: './model-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelDetailComponent implements OnChanges {
  selectedModel = input.required<ModelListResponseEntry | null>();
  activeTab = signal('general');
  logs = signal<{ filename: string; logUrl: string; content: string }[]>([]);
  private projectInfoService = inject(ProjectInfoService);
  private currentController: AbortController | null = null;

  ngOnChanges() {
    // Abort any async processes for the previous model
    if (this.currentController) {
      this.currentController.abort();
    }

    this.logs.set([]);

    if (!this.selectedModel()) {
      return;
    }

    // Create new abort controller for this model
    this.currentController = new AbortController();

    const basePath = this.getLogBasePath();

    // Fetch both stdout and stderr logs
    Promise.all([
      fetch(`${basePath}/train_stdout.log`, {
        signal: this.currentController.signal,
      }),
      fetch(`${basePath}/train_stderr.log`, {
        signal: this.currentController.signal,
      }),
    ])
      .then(async ([stdoutResponse, stderrResponse]) => {
        const logs = [];

        if (stdoutResponse.ok) {
          const content = await stdoutResponse.text();
          logs.push({
            filename: 'train_stdout.log',
            logUrl: `${basePath}/train_stdout.log`,
            // replace \r with \n for tqdm output: https://github.com/tqdm/tqdm/issues/506#issuecomment-373762049
            content: content.replaceAll('\r', '\n'),
          });
        }

        if (stderrResponse.ok) {
          const content = await stderrResponse.text();
          logs.push({
            filename: 'train_stderr.log',
            logUrl: `${basePath}/train_stderr.log`,
            // replace \r with \n for tqdm output: https://github.com/tqdm/tqdm/issues/506#issuecomment-373762049
            content: content.replaceAll('\r', '\n'),
          });
        }

        this.logs.set(logs);
      })
      .catch(this.logFetchErrorHandler.bind(this));
  }

  private logFetchErrorHandler(error: any) {
    // Only log errors that aren't from aborting
    if (error.name !== 'AbortError') {
      alert('Failed to fetch log, see console for error details');
      console.error('Error fetching logs:', error);
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

  private cdr = inject(ChangeDetectorRef);
  protected isReloading = new WeakMap<
    { content: string; logUrl: string; filename: string },
    boolean
  >();

  reloadLog(logEntry: { content: string; logUrl: string; filename: string }) {
    this.isReloading.set(logEntry, true);
    fetch(logEntry.logUrl, {
      signal: this.currentController!.signal,
    })
      .then((response) => {
        if (response.ok) {
          return response.text();
        } else {
          throw new Error('Failed to fetch log');
        }
      })
      .then((newContent) => {
        this.isReloading.set(logEntry, false);

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
        this.isReloading.set(logEntry, false);
        this.cdr.markForCheck();
        this.logFetchErrorHandler(error);
      });
  }
}
