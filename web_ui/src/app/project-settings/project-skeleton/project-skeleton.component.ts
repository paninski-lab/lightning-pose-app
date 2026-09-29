import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  linkedSignal,
  model,
  signal,
  viewChild,
} from '@angular/core';
import {
  isNamePair,
  skeletonProblems,
} from '../../components/skeleton-overlay/skeleton-validity';

@Component({
  selector: 'app-project-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-skeleton.component.html',
})
export class ProjectSkeletonComponent {
  keypointNames = input.required<string[]>();
  skeleton = model<unknown>([]);

  /** Keep a selection the user already made when the name list is refreshed. */
  protected left = linkedSignal<string[], string>({
    source: this.keypointNames,
    computation: (names, previous) =>
      previous && names.includes(previous.value)
        ? previous.value
        : (names[0] ?? ''),
  });
  protected right = linkedSignal<string[], string>({
    source: this.keypointNames,
    computation: (names, previous) =>
      previous && names.includes(previous.value)
        ? previous.value
        : (names[1] ?? names[0] ?? ''),
  });
  private attemptProblems = signal<string[]>([]);
  private leftSelect = viewChild<ElementRef<HTMLSelectElement>>('leftSelect');
  private rightSelect = viewChild<ElementRef<HTMLSelectElement>>('rightSelect');
  /** The selects emit change while their options are first inserted. */
  private picksLive = false;

  constructor() {
    afterNextRender(() => {
      this.applySelect(this.leftSelect()?.nativeElement, this.left());
      this.applySelect(this.rightSelect()?.nativeElement, this.right());
      this.picksLive = true;
    });
  }

  protected rows = computed(() => {
    const value = this.skeleton();
    if (!Array.isArray(value)) return [];
    return value.filter(isNamePair);
  });

  protected problems = computed(() => {
    const stored = skeletonProblems(this.skeleton(), this.keypointNames());
    return stored.length ? stored : this.attemptProblems();
  });

  protected onLeft(event: Event) {
    this.pick(this.left, event);
  }

  protected onRight(event: Event) {
    this.pick(this.right, event);
  }

  private pick(
    target: { set: (value: string) => void },
    event: Event,
  ) {
    if (!this.picksLive) return;
    target.set((event.target as HTMLSelectElement).value);
    this.attemptProblems.set([]);
  }

  private applySelect(select: HTMLSelectElement | undefined, value: string) {
    if (select && value && select.value !== value) select.value = value;
  }

  protected add() {
    const next = [
      ...this.rows(),
      [this.left(), this.right()] as [string, string],
    ];
    const problems = skeletonProblems(next, this.keypointNames());
    if (problems.length) {
      this.attemptProblems.set(problems);
      return;
    }
    this.attemptProblems.set([]);
    this.skeleton.set(next);
  }

  protected remove(index: number) {
    this.attemptProblems.set([]);
    this.skeleton.set(this.rows().filter((_, i) => i !== index));
  }
}
