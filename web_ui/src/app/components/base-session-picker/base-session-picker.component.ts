import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  model,
  signal,
  TemplateRef,
  untracked,
  viewChild,
} from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { Session } from '../../session.model';
import { DenseListboxComponent } from '../dense-listbox/dense-listbox.component';
import { DenseListboxItemComponent } from '../dense-listbox/dense-listbox-item.component';
import { SessionService } from '../../session.service';
import {
  DropdownComponent,
  DropdownContentComponent,
  DropdownTriggerComponent,
  DropdownTriggerDirective,
} from '../dropdown/dropdown.component';
import { PathEditableComponent } from '../path-editable/path-editable.component';

@Component({
  selector: 'app-base-session-picker',
  standalone: true,
  imports: [
    CommonModule,
    DenseListboxComponent,
    DenseListboxItemComponent,
    NgTemplateOutlet,
    DropdownComponent,
    DropdownContentComponent,
    DropdownTriggerComponent,
    DropdownTriggerDirective,
    PathEditableComponent,
  ],
  template: `
    <div class="px-3 py-2 border-b border-base-300 shrink-0">
      <app-path-editable [(path)]="baseDir"></app-path-editable>
    </div>

    @if (loading()) {
      <div class="p-4 flex justify-center">
        <progress class="progress w-full"></progress>
      </div>
    } @else {
      <app-dense-listbox class="flex-1 min-h-0" [(selected)]="selected">
        @for (session of sessions(); track session.key) {
          <app-dense-listbox-item
            [value]="session"
            [selected]="isSelected(session)"
          >
            <span left>{{ session.key }}</span>
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

      @if (ungroupedDirs().length > 0 || ungroupedVideos().length > 0) {
        <div class="px-3 py-2 border-t border-base-300 flex flex-col gap-1">
          @if (ungroupedDirs().length > 0) {
            <span class="text-xs text-base-content/60">
              {{ ungroupedDirs().length }}
              {{
                ungroupedDirs().length === 1 ? 'subdirectory' : 'subdirectories'
              }}
              not shown
            </span>
          }
          @if (ungroupedVideos().length > 0) {
            <app-dropdown class="dropdown-hover dropdown-top">
              <app-dropdown-trigger>
                <span
                  appDropdownTrigger
                  class="text-xs text-base-content/60 flex items-center gap-1 cursor-default select-none"
                >
                  <span class="material-icons text-xs! text-warning"
                    >warning</span
                  >
                  {{ ungroupedVideos().length }}
                  {{ ungroupedVideos().length === 1 ? 'video' : 'videos' }}
                  not shown
                </span>
              </app-dropdown-trigger>
              <app-dropdown-content>
                <div
                  class="p-2 max-h-48 overflow-y-auto flex flex-col gap-0.5 min-w-48 max-w-72"
                >
                  <p class="text-xs text-base-content/60 mb-1">
                    Didn't match view suffix or not all views present:
                  </p>
                  @for (f of ungroupedVideos(); track f) {
                    <div class="text-xs font-mono truncate">{{ f }}</div>
                  }
                </div>
              </app-dropdown-content>
            </app-dropdown>
          }
        </div>
      }
    }

    <ng-template #defaultRightTemplate let-session></ng-template>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BaseSessionPickerComponent {
  private sessionService = inject(SessionService);

  /** The directory to search for sessions. Editable via the path picker. */
  baseDir = model.required<string>();

  /** The list of sessions found under baseDir. */
  protected sessions = signal<Session[]>([]);

  /** Directories found directly under baseDir (not shown as sessions). */
  ungroupedDirs = signal<string[]>([]);

  /** Video files that couldn't be matched to any view pattern. */
  ungroupedVideos = signal<string[]>([]);

  /** The currently selected session. */
  selected = model<Session | undefined>();

  /** Whether sessions are still loading. */
  protected loading = signal(false);

  /** Optional template for the right slot of each session item. */
  rightTemplate = model<TemplateRef<{ $implicit: Session }> | null>(null);

  protected defaultRightTemplate = viewChild<
    TemplateRef<{ $implicit: Session }>
  >('defaultRightTemplate');

  protected getRightTemplate(): TemplateRef<{ $implicit: Session }> | null {
    return this.rightTemplate() || this.defaultRightTemplate() || null;
  }

  constructor() {
    effect(() => {
      const dir = this.baseDir();
      untracked(() => this.load(dir));
    });
  }

  private async load(dir: string) {
    this.loading.set(true);
    try {
      const result = await this.sessionService.getSessions(dir);
      this.sessions.set(result.sessions);
      this.ungroupedDirs.set(result.ungroupedDirs);
      this.ungroupedVideos.set(result.ungroupedVideos);
    } finally {
      this.loading.set(false);
    }
  }

  protected isSelected(session: Session): boolean {
    return this.selected()?.key === session.key;
  }
}
