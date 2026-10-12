import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertDialogComponent,
  AlertFooterComponent,
  AlertHeaderComponent,
} from '../components/alert-dialog/alert-dialog.component';
import { ProjectInfoService } from '../project-info.service';
import { RpcService } from '../rpc.service';
import { ToastService } from '../toast.service';
import {
  FileCheckTableComponent,
  FileCheckRow,
} from './file-check-table.component';
import { LoadLabelDialogComponent } from './load-label-dialog.component';
import {
  FileCheckResult,
  isUnderDir,
  joinPath,
  keepCurrentPathOrder,
  RGlobResponse,
  rpcErrorMessage,
} from './file-listing';

@Component({
  selector: 'app-label-files-panel',
  imports: [
    FormsModule,
    FileCheckTableComponent,
    AlertDialogComponent,
    AlertHeaderComponent,
    AlertFooterComponent,
    LoadLabelDialogComponent,
  ],
  template: `
    <section class="card bg-base-200">
      <div class="card-body gap-3">
        <h2 class="card-title">Label Data (CSV)</h2>
        <input
          type="checkbox"
          id="app-accordion-fm-labels"
          class="app-accordion-toggle"
        />
        <label
          for="app-accordion-fm-labels"
          class="app-accordion-title app-help-toggle text-sm"
        >
          <span class="app-accordion-icon" aria-hidden="true"></span>
          <span>Help</span>
        </label>
        <div class="app-accordion-content text-sm">
          <p class="m-0">
            This panel shows CSV files in the data directory, excluding files
            in the model directory. A label file is usually
            <code>CollectedData.csv</code>,
            <code>CollectedData_test.csv</code>, or
            <code>CollectedData_&lt;view&gt;.csv</code>.
          </p>
          <ul class="m-0 mt-2 flex list-disc flex-col gap-1 pl-5">
            <li>
              <strong>Add Label File</strong> copies CollectedData CSV files
              into the data directory. A local file is uploaded, and a server
              file is copied. The source file stays where it is. An existing
              file is left unchanged.
            </li>
            <li><strong>Refresh</strong> reloads this list.</li>
            <li>
              <strong>Validate All</strong> looks at the filename, the three
              header rows, and whether each row points to a frame in
              <code>labeled-data/</code>.
            </li>
            <li>
              <strong>Rename Selected</strong> changes the name of the selected
              file in its current folder.
            </li>
          </ul>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-sm btn-soft btn-primary"
              [disabled]="loading() || validating()"
              (click)="loadOpen.set(true)"
            >
              Add Label File
            </button>
            <button
              type="button"
              class="btn btn-sm btn-soft btn-info"
              [disabled]="loading() || validating()"
              (click)="refresh()"
            >
              Refresh
            </button>
            <button
              type="button"
              class="btn btn-sm btn-soft btn-info"
              [disabled]="loading() || validating() || rows().length === 0"
              (click)="validateFiles()"
            >
              Validate All
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-sm btn-soft btn-info"
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
          empty="No CSV files in the data directory."
        />
      </div>
    </section>

    @if (renameOpen()) {
      <app-alert-dialog (dismiss)="renameOpen.set(false)">
        <app-alert-header>Rename label file</app-alert-header>
        <div class="flex flex-col gap-2">
          <p class="text-sm m-0">The file stays in its current folder.</p>
          <input
            type="text"
            class="input input-bordered w-full"
            [class.input-error]="!!renameProblem()"
            [ngModel]="renameValue()"
            (ngModelChange)="renameValue.set($event)"
          />
          @if (renameProblem()) {
            <p class="text-error text-xs m-0">{{ renameProblem() }}</p>
          }
        </div>
        <app-alert-footer>
          <button class="btn btn-soft btn-info" type="button" (click)="renameOpen.set(false)">
            Cancel
          </button>
          <button
            class="btn btn-soft btn-info"
            type="button"
            [disabled]="!!renameProblem() || renameUnchanged()"
            (click)="confirmRename()"
          >
            Rename
          </button>
        </app-alert-footer>
      </app-alert-dialog>
    }
    @if (loadOpen()) {
      <app-load-label-dialog (done)="onLoadDone($event)" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelFilesPanelComponent implements OnInit {
  private projectInfo = inject(ProjectInfoService);
  private rpc = inject(RpcService);
  private toast = inject(ToastService);

  protected rows = signal<FileCheckRow[]>([]);
  protected loading = signal(false);
  protected validating = signal(false);
  protected selectedPath = signal<string | null>(null);
  protected renameOpen = signal(false);
  protected renameValue = signal('');
  protected loadOpen = signal(false);

  protected selectedRow = computed(
    () => this.rows().find((row) => row.path === this.selectedPath()) ?? null,
  );

  protected renameProblem = computed(() =>
    labelFilenameIssue(this.renameValue().trim(), this.viewNames()),
  );

  protected renameUnchanged = computed(() => {
    const current = this.selectedRow()?.path.split('/').at(-1);
    return this.renameValue().trim() === current;
  });

  protected async onLoadDone(saved: boolean) {
    this.loadOpen.set(false);
    if (!saved) return;
    await this.refresh();
    await this.validateFiles();
  }

  ngOnInit() {
    void this.refresh();
  }

  protected async refresh() {
    const info = this.projectInfo.projectContext()?.projectInfo;
    if (!info?.data_dir) {
      this.rows.set([]);
      this.selectedPath.set(null);
      return;
    }
    this.loading.set(true);
    try {
      const response = (await this.rpc.call('rglob', {
        baseDir: info.data_dir,
        pattern: '**/*.csv',
        noDirs: true,
        stat: false,
      })) as RGlobResponse;
      const paths = response.entries
        .map((entry) => String(entry.path))
        .filter((rel) => !isModelsCsv(rel, info.data_dir, info.model_dir))
        .sort();
      this.rows.set(paths.map((path) => uncheckedRow(path, null)));
      if (!paths.includes(this.selectedPath() ?? '')) {
        this.selectedPath.set(null);
      }
    } catch (err) {
      this.toast.showToast({
        content: rpcErrorMessage(err, 'Could not list label files'),
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
        sector: 'labels',
      })) as { items: FileCheckResult[] };
      this.rows.set(
        keepCurrentPathOrder(
          this.rows().map((row) => row.path),
          response.items,
        ).map((item) => checkedRow(item.path, null, item)),
      );
    } catch (err) {
      this.toast.showToast({
        content: rpcErrorMessage(err, 'Could not validate label files'),
        variant: 'error',
      });
    } finally {
      this.validating.set(false);
    }
  }

  protected openRename() {
    const row = this.selectedRow();
    if (!row) return;
    this.renameValue.set(row.path.split('/').at(-1) ?? '');
    this.renameOpen.set(true);
  }

  protected async confirmRename() {
    const row = this.selectedRow();
    const context = this.projectInfo.projectContext();
    const dataDir = context?.projectInfo?.data_dir;
    const key = context?.key;
    const nextName = this.renameValue().trim();
    if (!row || !dataDir || !key || this.renameProblem() || this.renameUnchanged()) {
      return;
    }
    try {
      await this.rpc.call('renameLabelFile', {
        projectKey: key,
        path: joinPath(dataDir, row.path),
        newFilename: nextName,
      });
      this.renameOpen.set(false);
      this.toast.showToast({ content: 'Renamed label file', variant: 'success' });
      const parent = row.path.includes('/')
        ? row.path.slice(0, row.path.lastIndexOf('/') + 1)
        : '';
      await this.refresh();
      this.selectedPath.set(parent + nextName);
    } catch (err) {
      this.toast.showToast({
        content: rpcErrorMessage(err, 'Rename failed'),
        variant: 'error',
      });
    }
  }

  private viewNames(): string[] {
    return this.projectInfo.projectContext()?.projectInfo?.views ?? [];
  }
}

function uncheckedRow(path: string, detail: string | null): FileCheckRow {
  return { path, detail, issues: [], warnings: [], checked: false };
}

function checkedRow(
  path: string,
  detail: string | null,
  item: FileCheckResult,
): FileCheckRow {
  return {
    path,
    detail,
    issues: item.issues,
    warnings: item.warnings,
    checked: true,
  };
}

function isModelsCsv(rel: string, dataDir: string, modelDir: string): boolean {
  const path = rel.replaceAll('\\', '/');
  if (path === 'models' || path.startsWith('models/')) return true;
  if (!modelDir) return false;
  return isUnderDir(joinPath(dataDir, path), modelDir);
}

function labelFilenameIssue(filename: string, views: string[]): string | null {
  if (!filename || filename.includes('/') || filename.includes('\\')) {
    return 'Enter a filename, not a path.';
  }
  const dot = filename.lastIndexOf('.');
  const suffix = dot >= 0 ? filename.slice(dot) : '';
  const expected = views.length
    ? 'Expected CollectedData_<view>.csv or CollectedData_<view>_test.csv.'
    : 'Expected CollectedData.csv or CollectedData_test.csv.';
  if (suffix.toLowerCase() !== '.csv') return expected;
  const stem = filename.slice(0, dot);
  if (!views.length) {
    if (stem === 'CollectedData' || stem === 'CollectedData_test') return null;
    return expected;
  }
  if (!stem.startsWith('CollectedData_')) return expected;
  const rest = stem.slice('CollectedData_'.length);
  const view = rest.endsWith('_test') ? rest.slice(0, -'_test'.length) : rest;
  if (!view || !views.includes(view)) {
    return `Unknown view in filename: ${view || '(missing)'}.`;
  }
  return null;
}
