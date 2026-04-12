import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { DirectoryBreadcrumbsComponent } from './directory-breadcrumbs.component';
import { DirectoryListComponent } from './directory-list.component';

@Component({
  selector: 'app-directory-picker',
  standalone: true,
  imports: [DirectoryBreadcrumbsComponent, DirectoryListComponent],
  template: `
    <div class="card card-bordered bg-base-100 shadow-lg p-4 w-full flex flex-col gap-4">
      <div class="flex items-center justify-between gap-4">
        <h2 class="card-title text-base flex items-center gap-2">
          <span class="material-icons">folder_open</span>
          Directory Picker
        </h2>
        <div class="badge badge-outline font-mono text-xs whitespace-nowrap overflow-hidden text-ellipsis max-w-[50%]">
          {{ currentPath() }}
        </div>
      </div>

      <app-directory-breadcrumbs
        [path]="currentPath()"
        (pathClick)="handlePathClick($event)"
      />

      <div class="flex-1 min-h-0 overflow-y-auto max-h-[400px]">
        <app-directory-list
          [directories]="directories()"
          (directoryClick)="handleDirectoryClick($event)"
          (directorySelect)="handleDirectorySelect($event)"
        />
      </div>

      <div class="card-actions justify-end mt-2">
        <button
          class="btn btn-sm btn-outline btn-ghost"
          (click)="onCancel.emit()"
        >
          Cancel
        </button>
        <button
          class="btn btn-sm btn-primary"
          (click)="onConfirm.emit(currentPath())"
          [disabled]="!currentPath()"
        >
          Select Current
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectoryPickerComponent {
  /** The currently displayed full path. */
  currentPath = input.required<string>();

  /** The list of sub-directory names in the current path. */
  directories = input.required<string[]>();

  /** Emitted when the user navigates to a new path. */
  pathChange = output<string>();

  /** Emitted when the user confirms the selection of a path. */
  onConfirm = output<string>();

  /** Emitted when the user cancels the operation. */
  onCancel = output<void>();

  protected handlePathClick(newPath: string) {
    this.pathChange.emit(newPath);
  }

  protected handleDirectoryClick(dirName: string) {
    const p = this.currentPath();
    const newPath = p.endsWith('/') ? `${p}${dirName}` : `${p}/${dirName}`;
    this.pathChange.emit(newPath);
  }

  protected handleDirectorySelect(dirName: string) {
    const p = this.currentPath();
    const newPath = p.endsWith('/') ? `${p}${dirName}` : `${p}/${dirName}`;
    this.onConfirm.emit(newPath);
  }
}
