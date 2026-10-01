import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SKELETON_COLOR } from './skeleton-validity';
import { SkeletonSegment } from './skeleton-bones';

@Component({
  selector: 'app-skeleton-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none absolute inset-0' },
  template: `
    <svg
      data-testid="skeleton-overlay"
      class="h-full w-full"
      aria-hidden="true"
    >
      @for (segment of segments(); track $index) {
        <line
          [attr.x1]="segment.x1"
          [attr.y1]="segment.y1"
          [attr.x2]="segment.x2"
          [attr.y2]="segment.y2"
          [attr.stroke]="color"
          [attr.stroke-width]="thickness()"
          [attr.stroke-opacity]="opacity()"
          stroke-linecap="round"
        />
      }
    </svg>
  `,
})
export class SkeletonOverlayComponent {
  segments = input.required<SkeletonSegment[]>();
  thickness = input(2);
  opacity = input(1);
  protected readonly color = SKELETON_COLOR;
}
