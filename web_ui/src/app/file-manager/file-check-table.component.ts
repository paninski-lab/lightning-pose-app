import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

export interface FileCheckRow {
  path: string;
  detail: string | null;
  issues: string[];
  warnings: string[];
  checked: boolean;
}

@Component({
  selector: 'app-file-check-table',
  template: `
    @if (loading()) {
      <div class="flex justify-center py-8">
        <span class="loading loading-spinner loading-md"></span>
      </div>
    } @else if (rows().length === 0) {
      <p class="text-sm m-0">{{ empty() }}</p>
    } @else {
      <div class="overflow-auto max-h-96">
        <table class="table table-sm table-zebra">
          <thead>
            <tr>
              <th scope="col">Path</th>
              <th scope="col">Check</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.path) {
              <tr
                class="cursor-pointer"
                [class.bg-base-300]="selectedPath() === row.path"
                (click)="rowSelected.emit(row.path)"
              >
                <td>
                  <div class="font-mono text-xs break-all">{{ row.path }}</div>
                  @if (row.detail) {
                    <div class="text-xs opacity-70">{{ row.detail }}</div>
                  }
                </td>
                <td>
                  @if (!row.checked) {
                    <span class="badge badge-ghost badge-sm">Not checked</span>
                  } @else if (row.issues.length) {
                    <span class="badge badge-error badge-sm">Invalid</span>
                    @for (issue of row.issues; track issue) {
                      <div class="text-error text-xs">{{ issue }}</div>
                    }
                  } @else if (row.warnings.length) {
                    <span class="badge badge-warning badge-sm">Check</span>
                    @for (warning of row.warnings; track warning) {
                      <div class="text-warning text-xs">{{ warning }}</div>
                    }
                  } @else {
                    <span class="badge badge-success badge-sm">OK</span>
                  }
                  @if (row.checked && row.issues.length && row.warnings.length) {
                    @for (warning of row.warnings; track warning) {
                      <div class="text-warning text-xs">{{ warning }}</div>
                    }
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileCheckTableComponent {
  rows = input.required<FileCheckRow[]>();
  loading = input(false);
  empty = input('Nothing found.');
  selectedPath = input<string | null>(null);
  rowSelected = output<string>();
}
