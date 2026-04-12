import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'app-directory-breadcrumbs',
  standalone: true,
  template: `
    <div class="breadcrumbs text-sm p-2 bg-base-200 rounded-lg shadow-inner w-full overflow-x-auto">
      <ul>
        @for (part of parts(); track part.path) {
          <li>
            <a
              class="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
              (click)="pathClick.emit(part.path)"
              [title]="part.path"
            >
              @if (part.isRoot) {
                <span class="material-icons text-base">home</span>
              } @else {
                {{ part.name }}
              }
            </a>
          </li>
        }
      </ul>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectoryBreadcrumbsComponent {
  /** The full path to display (e.g. "/home/user/project"). */
  path = input.required<string>();

  /** Emitted when a breadcrumb segment is clicked. Carries the full path up to that segment. */
  pathClick = output<string>();

  protected parts = computed(() => {
    const p = this.path();
    const segments = p.split('/').filter((s) => s.length > 0);
    const result: { name: string; path: string; isRoot?: boolean }[] = [
      { name: 'Root', path: '/', isRoot: true },
    ];

    let current = '';
    for (const seg of segments) {
      current += '/' + seg;
      result.push({ name: seg, path: current });
    }

    return result;
  });
}
