import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DirNavListComponent } from './dir-nav-list.component';
import { DirNavPathBarComponent } from './dir-nav-path-bar.component';

/**
 * Directory navigation and selection widget.
 *
 * Displays a path bar at the top and a scrollable list of subdirectories below.
 * The parent is responsible for responding to `navigate` events by updating
 * `currentPath` and `directories`.
 *
 * Usage:
 *   <app-dir-nav
 *     [currentPath]="path"
 *     [directories]="dirs"
 *     (navigate)="onNavigate($event)"
 *     (select)="onSelect($event)"
 *   />
 */
@Component({
  selector: 'app-dir-nav',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DirNavPathBarComponent, DirNavListComponent],
  template: `
    <div class="card bg-base-100 border border-base-300 shadow-sm w-full">

      <!-- Path bar -->
      <div class="px-4 pt-4 pb-2 border-b border-base-200">
        <div class="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-2">
          Location
        </div>
        <app-dir-nav-path-bar
          [path]="currentPath()"
          (segmentClick)="handleSegmentClick($event)"
          (pathChange)="navigate.emit($event)"
        />
      </div>

      <!-- Directory list -->
      <div class="overflow-y-auto max-h-72 px-2 py-2">
        <app-dir-nav-list
          [directories]="directories()"
          (navigate)="handleListNavigate($event)"
          (select)="handleListSelect($event)"
        />
      </div>

      <!-- Footer actions -->
      <div class="px-4 py-3 border-t border-base-200 flex items-center justify-between gap-3">
        <div class="text-xs text-base-content/40 font-mono truncate min-w-0 flex-1">
          {{ currentPath() }}
        </div>
        <div class="flex gap-2 shrink-0">
          @if (showCancel()) {
            <button class="btn btn-sm btn-ghost" (click)="cancel.emit()">Cancel</button>
          }
          <button class="btn btn-sm btn-primary" (click)="select.emit(currentPath())">
            Select
          </button>
        </div>
      </div>

    </div>
  `,
})
export class DirNavComponent {
  /** The fully-qualified path currently being viewed. */
  currentPath = input.required<string>();

  /** Subdirectory names (not full paths) present at `currentPath`. */
  directories = input.required<string[]>();

  /** Show a Cancel button in the footer. Default true. */
  showCancel = input<boolean>(true);

  /**
   * Emitted when the user navigates: either by clicking a breadcrumb segment,
   * typing a new path, or clicking a directory in the list.
   * The parent should update `currentPath` and `directories` in response.
   */
  navigate = output<string>();

  /** Emitted when the user confirms a selection (footer Select button or double-click). */
  select = output<string>();

  /** Emitted when the user clicks Cancel. */
  cancel = output<void>();

  handleSegmentClick(segPath: string) {
    this.navigate.emit(segPath);
  }

  handleListNavigate(dirName: string) {
    const base = this.currentPath().replace(/\/+$/, '');
    this.navigate.emit(`${base}/${dirName}`);
  }

  handleListSelect(dirName: string) {
    const base = this.currentPath().replace(/\/+$/, '');
    this.select.emit(`${base}/${dirName}`);
  }
}
