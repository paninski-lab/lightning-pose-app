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
    <div class="flex items-center p-2 bg-base-200 rounded-lg shadow-inner w-full overflow-x-auto gap-0.5">
      @for (part of parts(); track part.path) {
        <button
          class="badge badge-ghost hover:badge-neutral transition-colors font-mono text-[10px] h-5 min-h-5 px-1.5 border-none cursor-pointer bg-transparent"
          (click)="pathClick.emit(part.path)"
          [title]="part.path"
        >
          {{ part.isRoot ? 'Root' : part.name }}
        </button>
        @if (!$last) {
          <span class="text-base-content/80 font-bold font-mono text-[10px] mx-0.5">/</span>
        }
      }
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
      { name: '/', path: '/', isRoot: true },
    ];

    let current = '';
    for (const seg of segments) {
      current += '/' + seg;
      result.push({ name: seg, path: current });
    }

    return result;
  });
}
