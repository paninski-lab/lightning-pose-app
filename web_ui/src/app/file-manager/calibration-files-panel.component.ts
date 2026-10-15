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
  FileCheckRow,
  FileCheckTableComponent,
} from './file-check-table.component';
import { LoadCalibrationDialogComponent } from './load-calibration-dialog.component';
import {
  applyCachedChecks,
  fetchCachedFileChecks,
  FileCheckResult,
  joinPath,
  keepCurrentPathOrder,
  RGlobResponse,
  rpcErrorMessage,
} from './file-listing';

const SESSION_STEM = /^[A-Za-z0-9_.-]+$/;

@Component({
  selector: 'app-calibration-files-panel',
  imports: [
    FormsModule,
    FileCheckTableComponent,
    AlertDialogComponent,
    AlertHeaderComponent,
    AlertFooterComponent,
    LoadCalibrationDialogComponent,
  ],
  template: `
    <section class="card bg-base-200">
      <div class="card-body gap-3">
        <h2 class="card-title">Camera Calibration</h2>
        @if (!isMultiview()) {
          <p class="text-sm m-0">
            This project is single-view, so camera calibration is not used.
          </p>
        }
        <div
          class="flex flex-col gap-3"
          [class.pointer-events-none]="!isMultiview()"
          [class.opacity-50]="!isMultiview()"
          [attr.aria-disabled]="isMultiview() ? null : true"
        >
        <input
          type="checkbox"
          id="app-accordion-fm-calibration"
          class="app-accordion-toggle"
        />
        <label
          for="app-accordion-fm-calibration"
          class="app-accordion-title app-help-toggle text-sm"
        >
          <span class="app-accordion-icon" aria-hidden="true"></span>
          <span>Help</span>
        </label>
        <div class="app-accordion-content text-sm">
          <p class="m-0">
            This panel shows the camera calibration files used for multiview
            projects. A session file is
            <code>calibrations/&lt;session&gt;.toml</code>, where the session
            is the labeled-data folder name before the last <code>_</code>.
            The project file is <code>calibration.toml</code> in the data
            directory. Files in <code>calibrations/backups/</code> are not
            listed.
          </p>
          <ul class="m-0 mt-2 flex list-disc flex-col gap-1 pl-5">
            <li>
              <strong>Add Calibration</strong> asks whether to write one
              project file or session files. A project file is renamed to
              <code>calibration.toml</code> in the data directory. A session
              file keeps its name in <code>calibrations/</code>, and that
              folder is created when it is missing. The name before
              <code>.toml</code> is the session id. If that destination
              already exists, the dialog asks before replacing it.
            </li>
            <li><strong>Refresh</strong> reloads this list.</li>
            <li>
              <strong>Validate All</strong> checks that each file loads as a
              camera group, and that the camera names match the project views
              in order.
            </li>
            <li>
              <strong>Rename Selected</strong> changes the session id of a
              file in <code>calibrations/</code>.
              <code>calibration.toml</code> keeps its name.
            </li>
          </ul>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-sm btn-soft btn-primary"
              [disabled]="!isMultiview() || loading() || validating()"
              (click)="loadOpen.set(true)"
            >
              Add Calibration
            </button>
            <button
              type="button"
              class="btn btn-sm btn-soft btn-primary"
              [disabled]="!isMultiview() || loading() || validating()"
              (click)="refresh()"
            >
              Refresh
            </button>
            <button
              type="button"
              class="btn btn-sm btn-soft btn-primary"
              [disabled]="
                !isMultiview() || loading() || validating() || rows().length === 0
              "
              (click)="validateFiles()"
            >
              Validate All
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-sm btn-soft btn-primary"
              [disabled]="!isMultiview() || !canRename() || loading() || validating()"
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
          empty="No calibration.toml or session calibration files."
        />
        </div>
      </div>
    </section>

    @if (renameOpen()) {
      <app-alert-dialog (dismiss)="renameOpen.set(false)">
        <app-alert-header>Rename calibration file</app-alert-header>
        <div class="flex flex-col gap-2">
          <p class="text-sm m-0">
            The file stays in <code>calibrations/</code>. The name before
            <code>.toml</code> is the session id.
          </p>
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
          <button class="btn btn-soft btn-primary" type="button" (click)="renameOpen.set(false)">
            Cancel
          </button>
          <button
            class="btn btn-soft btn-primary"
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
      <app-load-calibration-dialog (done)="onLoadDone($event)" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalibrationFilesPanelComponent implements OnInit {
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
  protected isMultiview = computed(
    () => (this.projectInfo.projectContext()?.projectInfo?.views?.length ?? 0) > 1,
  );

  protected canRename = computed(() => isSessionCalibration(this.selectedPath()));

  protected renameProblem = computed(() =>
    calibrationFilenameIssue(this.renameValue().trim()),
  );

  protected renameUnchanged = computed(() => {
    const current = this.selectedPath()?.split('/').at(-1);
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
    const dataDir = this.projectInfo.projectContext()?.projectInfo?.data_dir;
    if (!dataDir) {
      this.rows.set([]);
      this.selectedPath.set(null);
      return;
    }
    this.loading.set(true);
    try {
      const [root, sessions] = await Promise.all([
        this.rglob(dataDir, 'calibration.toml'),
        this.rglob(dataDir, 'calibrations/*.toml'),
      ]);
      const paths = [
        ...root.entries.map((entry) => String(entry.path)),
        ...sessions.entries.map((entry) => String(entry.path)),
      ].filter(
        (path) =>
          path === 'calibration.toml' ||
          (path.startsWith('calibrations/') &&
            !path.slice('calibrations/'.length).includes('/')),
      );
      const unique = [...new Set(paths)].sort((a, b) => {
        if (a === 'calibration.toml') return -1;
        if (b === 'calibration.toml') return 1;
        return a.localeCompare(b);
      });
      const key = this.projectInfo.projectContext()?.key;
      const cached = key
        ? await fetchCachedFileChecks(
            (method, params) => this.rpc.call(method, params),
            key,
            'calibration',
          )
        : [];
      this.rows.set(
        applyCachedChecks(
          unique.map((path) => ({
            path,
            detail: path === 'calibration.toml' ? 'project file' : 'session file',
            issues: [] as string[],
            warnings: [] as string[],
            checked: false,
          })),
          cached,
        ),
      );
      if (!unique.includes(this.selectedPath() ?? '')) {
        this.selectedPath.set(null);
      }
    } catch (err) {
      this.toast.showToast({
        content: rpcErrorMessage(err, 'Could not list calibration files'),
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
        sector: 'calibration',
      })) as { items: FileCheckResult[] };
      const details = new Map(this.rows().map((row) => [row.path, row.detail]));
      this.rows.set(
        keepCurrentPathOrder(
          this.rows().map((row) => row.path),
          response.items,
        ).map((item) => ({
          path: item.path,
          detail: details.get(item.path) ?? null,
          issues: item.issues,
          warnings: item.warnings,
          checked: true,
        })),
      );
    } catch (err) {
      this.toast.showToast({
        content: rpcErrorMessage(err, 'Could not validate calibration files'),
        variant: 'error',
      });
    } finally {
      this.validating.set(false);
    }
  }

  protected openRename() {
    const path = this.selectedPath();
    if (!isSessionCalibration(path)) return;
    this.renameValue.set(path.split('/').at(-1) ?? '');
    this.renameOpen.set(true);
  }

  protected async confirmRename() {
    const path = this.selectedPath();
    const context = this.projectInfo.projectContext();
    const dataDir = context?.projectInfo?.data_dir;
    const key = context?.key;
    const nextName = this.renameValue().trim();
    if (
      !path ||
      !dataDir ||
      !key ||
      !isSessionCalibration(path) ||
      this.renameProblem() ||
      this.renameUnchanged()
    ) {
      return;
    }
    try {
      await this.rpc.call('renameCalibrationFile', {
        projectKey: key,
        path: joinPath(dataDir, path),
        newFilename: nextName,
      });
      this.renameOpen.set(false);
      this.toast.showToast({
        content: 'Renamed calibration file',
        variant: 'success',
      });
      await this.refresh();
      this.selectedPath.set(`calibrations/${nextName}`);
    } catch (err) {
      this.toast.showToast({
        content: rpcErrorMessage(err, 'Rename failed'),
        variant: 'error',
      });
    }
  }

  private async rglob(baseDir: string, pattern: string) {
    return (await this.rpc.call('rglob', {
      baseDir,
      pattern,
      noDirs: true,
      stat: false,
    })) as RGlobResponse;
  }
}

function isSessionCalibration(path: string | null): path is string {
  if (!path?.startsWith('calibrations/')) return false;
  const name = path.slice('calibrations/'.length);
  return name.length > 0 && !name.includes('/') && name.toLowerCase().endsWith('.toml');
}

function calibrationFilenameIssue(filename: string): string | null {
  if (!filename || filename.includes('/') || filename.includes('\\')) {
    return 'Enter a filename, not a path.';
  }
  if (!filename.toLowerCase().endsWith('.toml')) {
    return 'Enter a session filename ending in .toml.';
  }
  const stem = filename.slice(0, filename.length - '.toml'.length);
  if (!stem || !SESSION_STEM.test(stem)) {
    return 'Session id may use letters, digits, and . _ -.';
  }
  return null;
}
