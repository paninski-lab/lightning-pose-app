import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ModelRenameDialogComponent } from '../models-page/model-rename-dialog/model-rename-dialog.component';
import { ProjectInfoService } from '../project-info.service';
import { RpcService } from '../rpc.service';
import { ToastService } from '../toast.service';
import {
  FileCheckTableComponent,
  FileCheckRow,
} from './file-check-table.component';
import {
  FileCheckResult,
  joinPath,
  RGlobEntry,
  RGlobResponse,
  rpcErrorMessage,
} from './file-listing';

@Component({
  selector: 'app-model-files-panel',
  imports: [FileCheckTableComponent, ModelRenameDialogComponent],
  template: `
    <section class="card bg-base-200">
      <div class="card-body gap-3">
        <h2 class="card-title">Models</h2>
        <p class="text-sm m-0">
          This panel shows folders in the model directory, including folders
          the Models page does not open. A model folder usually contains
          <code>config.yaml</code> or <code>ensemble.yaml</code>.
          <strong>Validate All</strong> looks at the folder name, those files,
          <code>train_status.json</code> when it is present, and prediction CSV
          names in <code>video_preds/</code>. <strong>Rename Selected</strong>
          changes the selected folder's name within the model directory.
        </p>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-sm btn-primary"
              [disabled]="loading() || validating()"
              (click)="refresh()"
            >
              Refresh
            </button>
            <button
              type="button"
              class="btn btn-sm btn-primary"
              [disabled]="loading() || validating() || rows().length === 0"
              (click)="validateFiles()"
            >
              Validate All
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-sm btn-primary"
              [disabled]="!selectedPath() || loading() || validating()"
              (click)="openRename()"
            >
              Rename Selected
            </button>
          </div>
        </div>
        <app-file-check-table
          [rows]="rows()"
          [loading]="loading()"
          [selectedPath]="selectedPath()"
          (rowSelected)="selectedPath.set($event)"
          empty="No directories in the model directory."
        />
      </div>
    </section>

    @if (renamePath(); as path) {
      <app-model-rename-dialog
        [modelRelativePath]="path"
        (done)="onRenameDone($event)"
      />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelFilesPanelComponent implements OnInit {
  private projectInfo = inject(ProjectInfoService);
  private rpc = inject(RpcService);
  private toast = inject(ToastService);

  protected rows = signal<FileCheckRow[]>([]);
  protected loading = signal(false);
  protected validating = signal(false);
  protected selectedPath = signal<string | null>(null);
  protected renamePath = signal<string | null>(null);

  ngOnInit() {
    void this.refresh();
  }

  protected async refresh() {
    const modelDir = this.projectInfo.projectContext()?.projectInfo?.model_dir;
    if (!modelDir) {
      this.rows.set([]);
      this.selectedPath.set(null);
      return;
    }
    this.loading.set(true);
    try {
      const paths = await this.listModelDirs(modelDir);
      this.rows.set(
        paths.map((path) => ({
          path,
          detail: null,
          issues: [],
          warnings: [],
          checked: false,
        })),
      );
      if (!paths.includes(this.selectedPath() ?? '')) {
        this.selectedPath.set(null);
      }
    } catch (err) {
      this.toast.showToast({
        content: rpcErrorMessage(err, 'Could not list models'),
        variant: 'error',
      });
    } finally {
      this.loading.set(false);
    }
  }

  protected async validateFiles() {
    const key = this.projectInfo.projectContext()?.key;
    if (!key || this.validating()) return;
    this.validating.set(true);
    try {
      const response = (await this.rpc.call('validateProjectFiles', {
        projectKey: key,
        sector: 'models',
      })) as { items: FileCheckResult[] };
      this.rows.set(
        response.items.map((item) => ({
          path: item.path,
          detail: null,
          issues: item.issues,
          warnings: item.warnings,
          checked: true,
        })),
      );
    } catch (err) {
      this.toast.showToast({
        content: rpcErrorMessage(err, 'Could not validate models'),
        variant: 'error',
      });
    } finally {
      this.validating.set(false);
    }
  }

  protected openRename() {
    const path = this.selectedPath();
    if (!path) return;
    this.renamePath.set(path);
  }

  protected async onRenameDone(renamed: boolean) {
    this.renamePath.set(null);
    if (renamed) await this.refresh();
  }

  /** Level-1 directories, plus level-2 when the parent has no config or ensemble file. */
  private async listModelDirs(modelDir: string): Promise<string[]> {
    const top = await this.rglob(modelDir, '*', true);
    const topDirs = top
      .filter((entry) => entry.type === 'dir')
      .map((entry) => String(entry.path));
    const configs = await this.rglob(modelDir, '*/config.yaml', false);
    const ensembles = await this.rglob(modelDir, '*/ensemble.yaml', false);
    const recognized = new Set<string>();
    for (const entry of [...configs, ...ensembles]) {
      const parent = String(entry.path).split('/').slice(0, -1).join('/');
      if (parent) recognized.add(parent);
    }
    const paths = [...topDirs];
    for (const dir of topDirs) {
      if (recognized.has(dir)) continue;
      const nested = await this.rglob(joinPath(modelDir, dir), '*', true);
      for (const child of nested) {
        if (child.type === 'dir') paths.push(`${dir}/${child.path}`);
      }
    }
    return paths.sort((a, b) => a.localeCompare(b));
  }

  private async rglob(baseDir: string, pattern: string, stat: boolean) {
    const response = (await this.rpc.call('rglob', {
      baseDir,
      pattern,
      noDirs: !stat,
      stat,
    })) as RGlobResponse;
    return response.entries satisfies RGlobEntry[];
  }
}
