import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
  output,
} from '@angular/core';
import {
  DEFAULT_SKELETON_OPACITY,
  DEFAULT_SKELETON_THICKNESS,
  formatSkeletonThickness,
  MAX_SKELETON_THICKNESS,
  MIN_SKELETON_THICKNESS,
  SKELETON_THICKNESS_STEP,
} from '../skeleton-overlay/skeleton-validity';

@Component({
  selector: 'app-skeleton-view-options',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-2 pt-2">
      <svg viewBox="0 0 24 24" class="h-4 w-4" aria-hidden="true">
        <circle cx="5" cy="8" r="2.2" fill="currentColor" />
        <circle cx="5" cy="16" r="2.2" fill="currentColor" />
        <circle cx="19" cy="8" r="2.2" fill="currentColor" />
        <circle cx="19" cy="16" r="2.2" fill="currentColor" />
        <rect
          x="6"
          y="10.2"
          width="12"
          height="3.6"
          rx="1.2"
          fill="currentColor"
        />
      </svg>
      Show skeleton
      <input
        type="checkbox"
        class="toggle toggle-sm"
        aria-label="Show skeleton"
        [checked]="invalid() ? false : showSkeleton()"
        [disabled]="invalid()"
        (change)="onToggle($event)"
      />
      @if (invalid()) {
        <span class="text-error text-xs">Skeleton definition is invalid.</span>
      }
    </div>
    @if (showSkeleton() && !invalid()) {
      <div class="flex items-center gap-2 pt-2">
        <span class="material-icons text-sm!">line_weight</span>
        Bone thickness
      </div>
      <div class="pl-2 flex items-center">
        <input
          type="range"
          class="range range-xs"
          aria-label="Bone thickness"
          [attr.min]="minThickness"
          [attr.max]="maxThickness"
          [attr.step]="thicknessStep"
          [value]="thickness()"
          (input)="onThickness($event)"
        />
        <button
          type="button"
          class="btn btn-ghost btn-xs tooltip"
          data-tip="Reset"
          [disabled]="thicknessIsDefault()"
          (click)="resetThickness.emit()"
        >
          <span class="material-icons text-sm!">restart_alt</span>
        </button>
      </div>
      <div class="pl-2 opacity-60 text-xs">
        {{ formatThickness(thickness()) }}
      </div>
      <div class="flex items-center gap-2 pt-2">
        <span class="material-icons text-sm!">opacity</span>
        Bone opacity
      </div>
      <div class="pl-2 flex items-center">
        <input
          type="range"
          class="range range-xs"
          aria-label="Bone opacity"
          min="0"
          max="1"
          step="0.05"
          [value]="opacity()"
          (input)="onOpacity($event)"
        />
        <button
          type="button"
          class="btn btn-ghost btn-xs tooltip"
          data-tip="Reset"
          [disabled]="opacityIsDefault()"
          (click)="resetOpacity.emit()"
        >
          <span class="material-icons text-sm!">restart_alt</span>
        </button>
      </div>
      <div class="pl-2 opacity-60 text-xs">{{ opacity() }}</div>
    }
  `,
})
export class SkeletonViewOptionsComponent {
  protected readonly minThickness = MIN_SKELETON_THICKNESS;
  protected readonly maxThickness = MAX_SKELETON_THICKNESS;
  protected readonly thicknessStep = SKELETON_THICKNESS_STEP;
  protected readonly formatThickness = formatSkeletonThickness;

  showSkeleton = model(true);
  thickness = model(DEFAULT_SKELETON_THICKNESS);
  opacity = model(DEFAULT_SKELETON_OPACITY);
  invalid = input(false);
  thicknessIsDefault = input(false);
  opacityIsDefault = input(false);
  resetThickness = output<void>();
  resetOpacity = output<void>();

  protected onToggle(event: Event) {
    if (this.invalid()) return;
    this.showSkeleton.set((event.target as HTMLInputElement).checked);
  }

  protected onThickness(event: Event) {
    this.thickness.set(Number((event.target as HTMLInputElement).value));
  }

  protected onOpacity(event: Event) {
    this.opacity.set(Number((event.target as HTMLInputElement).value));
  }
}
