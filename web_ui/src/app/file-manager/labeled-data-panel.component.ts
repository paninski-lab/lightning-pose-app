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
import {
  FileCheckResult,
  joinPath,
  keepCurrentPathOrder,
  RGlobResponse,
  rpcErrorMessage,
} from './file-listing';

const FRAME_NAME = /[A-Za-z_-]+\d+\.(png|jpg)$/;

@Component({
  selector: 'app-labeled-data-panel',
  imports: [
    FormsModule,
    FileCheckTableComponent,
    AlertDialogComponent,
    AlertHeaderComponent,
    AlertFooterComponent,
  ],
  template: `
    <section class="card bg-base-200">
      <div class="card-body gap-3">
        <h2 class="card-title">Labeled Image Folders</h2>
        <input
          type="checkbox"
          id="app-accordion-fm-labeled-data"
          class="app-accordion-toggle"
        />
        <label
          for="app-accordion-fm-labeled-data"
          class="app-accordion-title app-help-toggle text-sm"
        >
          <span class="app-accordion-icon" aria-hidden="true"></span>
          <span>Help</span>
        </label>
        <div class="app-accordion-content text-sm">
          <p class="m-0">
            This panel shows session folders inside <code>labeled-data/</code>,
            with a count of frame images in each folder. A folder name is
            usually <code>session</code> or <code>session_view</code>, and a
            frame is usually named like <code>img000123.png</code>.
          </p>
          <ul class="m-0 mt-2 flex list-disc flex-col gap-1 pl-5">
            <li><strong>Refresh</strong> reloads this list.</li>
            <li>
              <strong>Validate All</strong> looks at the folder and frame
              names.
            </li>
            <li>
              <strong>Rename Selected</strong> changes the name of the selected
              folder and updates label CSV paths that point at it.
            </li>
          </ul>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-sm btn-soft btn-primary"
              [disabled]="loading() || validating()"
              (click)="refresh()"
            >
              Refresh
            </button>
            <button
              type="button"
              class="btn btn-sm btn-soft btn-primary"
              [disabled]="loading() || validating() || rows().length === 0"
              (click)="validateFiles()"
            >
              Validate All
            </button>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-sm btn-soft btn-primary"
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
          empty="No labeled-data directory."
        />
      </div>
    </section>

    @if (renameOpen()) {
      <app-alert-dialog (dismiss)="renameOpen.set(false)">
        <app-alert-header>Rename selected</app-alert-header>
        <div class="flex flex-col gap-2">
          @if (selectedRow()?.detail === 'file') {
            <p class="text-sm m-0">
              The file stays inside <code>labeled-data/</code>. Label CSV rows
              that point at this file are updated.
            </p>
          } @else {
            <p class="text-sm m-0">
              The folder stays inside <code>labeled-data/</code>. Label CSV
              paths that point at it are updated.
            </p>
          }
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabeledDataPanelComponent implements OnInit {
  private projectInfo = inject(ProjectInfoService);
  private rpc = inject(RpcService);
  private toast = inject(ToastService);

  protected rows = signal<FileCheckRow[]>([]);
  protected loading = signal(false);
  protected validating = signal(false);
  protected selectedPath = signal<string | null>(null);
  protected renameOpen = signal(false);
  protected renameValue = signal('');
  private details = new Map<string, string>();

  protected selectedRow = computed(
    () => this.rows().find((row) => row.path === this.selectedPath()) ?? null,
  );

  protected renameProblem = computed(() => {
    const name = this.renameValue().trim();
    if (
      !name ||
      name.includes('/') ||
      name.includes('\\') ||
      name === '.' ||
      name === '..'
    ) {
      return 'Enter a name, not a path.';
    }
    if (this.selectedRow()?.detail === 'file') return null;
    return sessionStemIssue(name, this.viewNames());
  });

  protected renameUnchanged = computed(() => {
    const current = this.selectedRow()?.path.split('/').at(-1);
    return this.renameValue().trim() === current;
  });

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
      const [top, nested] = await Promise.all([
        this.rglob(dataDir, 'labeled-data/*', true),
        this.rglob(dataDir, 'labeled-data/*/*', true),
      ]);
      const imageCounts = new Map<string, number>();
      for (const entry of nested.entries) {
        const rel = String(entry.path);
        const name = rel.split('/').at(-1) ?? '';
        if (entry.type === 'dir' || !FRAME_NAME.test(name)) continue;
        const parent = rel.split('/').slice(0, -1).join('/');
        imageCounts.set(parent, (imageCounts.get(parent) ?? 0) + 1);
      }
      const details = new Map<string, string>();
      const rows = top.entries
        .map((entry) => {
          const path = String(entry.path);
          const detail =
            entry.type === 'dir'
              ? `${imageCounts.get(path) ?? 0} images`
              : 'file';
          details.set(path, detail);
          return {
            path,
            detail,
            issues: [],
            warnings: [],
            checked: false,
          } satisfies FileCheckRow;
        })
        .sort((a, b) => a.path.localeCompare(b.path));
      this.details = details;
      this.rows.set(rows);
      if (!rows.some((row) => row.path === this.selectedPath())) {
        this.selectedPath.set(null);
      }
    } catch (err) {
      this.toast.showToast({
        content: rpcErrorMessage(err, 'Could not list labeled data'),
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
        sector: 'labeled-data',
      })) as { items: FileCheckResult[] };
      this.rows.set(
        keepCurrentPathOrder(
          this.rows().map((row) => row.path),
          response.items,
        ).map((item) => ({
          path: item.path,
          detail: this.details.get(item.path) ?? null,
          issues: item.issues,
          warnings: item.warnings,
          checked: true,
        })),
      );
    } catch (err) {
      this.toast.showToast({
        content: rpcErrorMessage(err, 'Could not validate labeled data'),
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
      await this.rpc.call('renameLabeledDataFolder', {
        projectKey: key,
        path: joinPath(dataDir, row.path),
        newName: nextName,
      });
      this.renameOpen.set(false);
      this.toast.showToast({
        content: 'Renamed labeled data',
        variant: 'success',
      });
      await this.refresh();
      this.selectedPath.set(`labeled-data/${nextName}`);
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

  private async rglob(baseDir: string, pattern: string, stat: boolean) {
    return (await this.rpc.call('rglob', {
      baseDir,
      pattern,
      noDirs: false,
      stat,
    })) as RGlobResponse;
  }
}

function sessionStemIssue(stem: string, views: string[]): string | null {
  if (!/^[A-Za-z0-9_.-]+$/.test(stem)) {
    return 'Directory name contains invalid characters.';
  }
  if (!views.length) return null;
  if (!stem.includes('_')) {
    return 'Directory name must be of the form session_view.';
  }
  const split = stem.lastIndexOf('_');
  const session = stem.slice(0, split);
  const view = stem.slice(split + 1);
  if (!session || !view) return 'Invalid session/view in directory name.';
  if (!views.includes(view)) return `Unknown view: ${view}`;
  return null;
}
