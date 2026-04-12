import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'app-directory-list',
  standalone: true,
  template: `
    <div class="overflow-x-auto w-full mt-2 border border-base-200 rounded-lg">
      <table class="table table-sm table-zebra w-full">
        <thead>
          <tr>
            <th class="w-10">Icon</th>
            <th>Name</th>
            <th class="w-20 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (dirName of directories(); track dirName) {
            <tr class="hover:bg-base-200 cursor-pointer transition-colors" (click)="directoryClick.emit(dirName)">
              <td>
                <span class="material-icons text-warning">folder</span>
              </td>
              <td class="font-medium font-mono text-sm">{{ dirName }}</td>
              <td class="text-right">
                <button
                  class="btn btn-xs btn-ghost btn-circle hover:text-primary"
                  title="Select directory"
                  (click)="$event.stopPropagation(); directorySelect.emit(dirName)"
                >
                  <span class="material-icons text-sm">check_circle</span>
                </button>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="3" class="text-center py-8 text-base-content/50 italic">
                No directories found.
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectoryListComponent {
  /** A list of directory names in the current path. */
  directories = input.required<string[]>();

  /** Emitted when a directory is clicked (usually for navigation). */
  directoryClick = output<string>();

  /** Emitted when the "Select" button for a directory is clicked. */
  directorySelect = output<string>();
}
