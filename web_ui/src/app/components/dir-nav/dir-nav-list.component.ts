import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-dir-nav-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (directories().length === 0) {
      <div class="flex flex-col items-center justify-center py-12 gap-3 text-base-content/40 select-none">
        <svg xmlns="http://www.w3.org/2000/svg" class="size-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
        <span class="text-sm">No subdirectories</span>
      </div>
    } @else {
      <ul class="menu menu-sm w-full gap-0.5 p-0">
        @for (dir of directories(); track dir) {
          <li>
            <button
              class="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-left hover:bg-base-200 active:bg-base-300 transition-colors group"
              (click)="navigate.emit(dir)"
              (dblclick)="select.emit(dir)"
              [title]="'Navigate into ' + dir"
            >
              <!-- Folder icon -->
              <svg xmlns="http://www.w3.org/2000/svg" class="size-4 shrink-0 text-warning/80 group-hover:text-warning transition-colors" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-15a3 3 0 00-3 3V18a3 3 0 003 3h15zM1.5 10.146V6a3 3 0 013-3h5.379a2.25 2.25 0 011.59.659l2.122 2.121c.14.141.331.22.53.22H19.5a3 3 0 013 3v1.146A4.483 4.483 0 0019.5 9h-15a4.483 4.483 0 00-3 1.146z" />
              </svg>

              <span class="font-mono text-sm truncate flex-1">{{ dir }}</span>

              <!-- Chevron -->
              <svg xmlns="http://www.w3.org/2000/svg" class="size-4 shrink-0 text-base-content/30 group-hover:text-base-content/60 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class DirNavListComponent {
  /** Directory names (not full paths) to display. */
  directories = input.required<string[]>();

  /** Emitted on single click — navigate into this directory. */
  navigate = output<string>();

  /** Emitted on double-click — select this directory as the final choice. */
  select = output<string>();
}
