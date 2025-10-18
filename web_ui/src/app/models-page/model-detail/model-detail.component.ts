import {
  ChangeDetectionStrategy,
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
  logs = signal<{ filename: string; content: string }[]>([]);
  private projectInfoService = inject(ProjectInfoService);
  private currentController: AbortController | null = null;

  ngOnChanges() {
    // Abort any ongoing fetch
    if (this.currentController) {
      this.currentController.abort();
    }

    this.logs.set([]);

    if (!this.selectedModel()) {
      return;
    }

    // Create new abort controller for this fetch
    this.currentController = new AbortController();

    const basePath =
      '/app/v0/files/' +
      this.projectInfoService.projectInfo.model_dir +
      '/' +
      this.selectedModel()?.model_relative_path;

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
            // replace \r with \n for tqdm output: https://github.com/tqdm/tqdm/issues/506#issuecomment-373762049
            content: content.replaceAll('\r', '\n'),
          });
        }

        if (stderrResponse.ok) {
          const content = await stderrResponse.text();
          logs.push({
            filename: 'train_stderr.log',
            // replace \r with \n for tqdm output: https://github.com/tqdm/tqdm/issues/506#issuecomment-373762049
            content: content.replaceAll('\r', '\n'),
          });
        }

        this.logs.set(logs);
      })
      .catch((error) => {
        // Only log errors that aren't from aborting
        if (error.name !== 'AbortError') {
          console.error('Error fetching logs:', error);
        }
      })
      .finally(() => {
        if (this.currentController?.signal.aborted) {
          this.currentController = null;
        }
      });
  }
}
