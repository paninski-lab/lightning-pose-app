import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { Session } from '../../session.model';
import { DenseListboxComponent } from '../dense-listbox/dense-listbox.component';
import { DenseListboxItemComponent } from '../dense-listbox/dense-listbox-item.component';
import { PathPipe } from '../../utils/pipes';

@Component({
  selector: 'app-base-session-picker',
  standalone: true,
  imports: [
    CommonModule,
    DenseListboxComponent,
    DenseListboxItemComponent,
    PathPipe,
    NgTemplateOutlet,
  ],
  template: `
    @if (loading()) {
      <div class="p-4 flex justify-center">
        <progress class="progress w-full"></progress>
      </div>
    } @else {
      <app-dense-listbox [(selected)]="selected">
        @for (session of sessions(); track session.key) {
          <app-dense-listbox-item
            [value]="session"
            [selected]="isSelected(session)"
          >
            <span left>{{ session.relativePath | path }}</span>
            <div right>
              <ng-container
                *ngTemplateOutlet="
                  getRightTemplate();
                  context: { $implicit: session }
                "
              ></ng-container>
            </div>
          </app-dense-listbox-item>
        }
      </app-dense-listbox>
    }

    <ng-template #defaultRightTemplate let-session></ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BaseSessionPickerComponent {
  /** The list of sessions to display. */
  sessions = input.required<Session[]>();

  /** The currently selected session. */
  selected = model<Session | undefined>();

  /** Whether sessions are still loading. */
  loading = input<boolean>(false);

  /**
   * Optional template for the right slot of each session item.
   * This can be passed via input for composition.
   */
  rightTemplate = input<TemplateRef<{ $implicit: Session }> | null>(null);

  /**
   * Access the default right template if needed.
   */
  protected defaultRightTemplate =
    viewChild<TemplateRef<{ $implicit: Session }>>('defaultRightTemplate');

  /**
   * Provides the template to be used for the right slot.
   * Subclasses can override this to provide a specific template without using the input.
   */
  protected getRightTemplate(): TemplateRef<{ $implicit: Session }> | null {
    return this.rightTemplate() || this.defaultRightTemplate() || null;
  }

  /**
   * Helper to check if a session is selected.
   */
  protected isSelected(session: Session): boolean {
    return this.selected()?.key === session.key;
  }
}
