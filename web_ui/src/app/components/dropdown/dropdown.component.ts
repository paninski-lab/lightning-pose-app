import {
  booleanAttribute,
  Component,
  contentChild,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  model,
  Renderer2,
  signal,
  viewChild,
} from '@angular/core';

@Directive({
  selector: '[appDropdownTrigger]',
  standalone: true,
})
export class DropdownTriggerDirective {}

@Component({
  selector: 'app-dropdown-trigger',
  standalone: true,
  template: `<ng-content></ng-content>`,
  styles: [':host { display: contents; }'],
})
export class DropdownTriggerComponent {}
@Component({
  selector: 'app-dropdown-content',
  standalone: true,
  template: `<ng-content></ng-content>`,
  styles: [':host { display: block; }'],
})
export class DropdownContentComponent {}

let nextDropdownId = 0;

@Component({
  selector: 'app-dropdown',
  standalone: true,
  host: {
    '[class.w-full]': 'fullWidth()',
  },
  template: `
    <div [class.w-full]="fullWidth()">
      <ng-content select="app-dropdown-trigger"></ng-content>
      <div
        #popoverContent
        popover="auto"
        [id]="popoverId"
        [style.position-anchor]="anchorName"
        class="popover-container"
        [class.dropdown-end]="alignEnd()"
        [class.w-full]="fullWidth()"
        (toggle)="onPopoverToggle($event)"
      >
        <div
          class="dropdown-content bg-base-200 rounded-box shadow border border-base-300 overflow-hidden"
        >
          <ng-content select="app-dropdown-content"></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }
      :host(.w-full) {
        display: block;
      }
      /* Ensure popover is positioned correctly relative to anchor */
      [popover] {
        position: absolute;
        inset: unset;
        top: anchor(bottom);
        left: anchor(left);
        margin: 0;
        min-width: max-content;
        border: none; /* Reset default popover border if any */
        padding: 0; /* Reset default popover padding if any */
        background: transparent; /* Let the inner div handle background */
        overflow: visible; /* Allow shadow to be seen if needed */
      }
      /* Align to the right edge of the anchor */
      :host(.dropdown-end) [popover],
      [popover].dropdown-end {
        left: unset;
        right: anchor(right);
      }
      /* Align to the top of the anchor */
      :host(.dropdown-top) [popover],
      [popover].dropdown-top {
        top: unset;
        bottom: anchor(top);
      }
      /* Align to the left of the anchor */
      :host(.dropdown-left) [popover],
      [popover].dropdown-left {
        top: anchor(top);
        left: unset;
        right: anchor(left);
      }
      /* Align to the right of the anchor */
      :host(.dropdown-right) [popover],
      [popover].dropdown-right {
        top: anchor(top);
        left: anchor(right);
      }
      [popover].w-full {
        width: anchor-size(width);
      }
      [popover]:popover-open .dropdown-content {
        visibility: visible !important;
        opacity: 1 !important;
      }
    `,
  ],
})
export class DropdownComponent {
  private renderer = inject(Renderer2);
  private el = inject(ElementRef);
  isOpen = model(false);
  triggerAction = input<'toggle' | 'show'>('toggle');
  alignEnd = input(false, { transform: booleanAttribute });
  fullWidth = input(false, { transform: booleanAttribute });
  trigger = contentChild(DropdownTriggerDirective, { read: ElementRef });
  popoverContent = viewChild<ElementRef<HTMLElement>>('popoverContent');

  private id = nextDropdownId++;
  protected popoverId = `popover-${this.id}`;
  protected anchorName = `--anchor-${this.id}`;

  constructor() {
    // Sync the model with the actual popover state
    effect(() => {
      const open = this.isOpen();
      const popover = this.popoverContent()?.nativeElement;
      if (!popover) return;

      const isActuallyOpen = popover.matches(':popover-open');
      if (open && !isActuallyOpen) {
        popover.showPopover();
      } else if (!open && isActuallyOpen) {
        popover.hidePopover();
      }
    });

    // Automatically manage the popover attributes when the trigger is available
    effect((onCleanup) => {
      const triggerEl = this.trigger()?.nativeElement;
      const hostEl = this.el.nativeElement;

      if (triggerEl) {
        this.renderer.setStyle(triggerEl, 'anchor-name', this.anchorName);
        onCleanup(() => this.renderer.removeStyle(triggerEl, 'anchor-name'));

        const isButton =
          triggerEl.tagName === 'BUTTON' || triggerEl.tagName === 'INPUT';

        if (isButton) {
          this.renderer.setAttribute(
            triggerEl,
            'popovertarget',
            this.popoverId,
          );
          this.renderer.setAttribute(
            triggerEl,
            'popovertargetaction',
            this.triggerAction(),
          );
        } else {
          // Manual toggle for non-button elements
          const unlisten = this.renderer.listen(triggerEl, 'click', () => {
            const popover = this.popoverContent()?.nativeElement;
            if (this.triggerAction() === 'show') {
              popover?.showPopover();
            } else {
              popover?.togglePopover();
            }
          });
          onCleanup(() => unlisten());
        }
      } else {
        this.renderer.setStyle(hostEl, 'anchor-name', this.anchorName);
        onCleanup(() => this.renderer.removeStyle(hostEl, 'anchor-name'));
      }

      // Handle hover if class is present on host
      if (hostEl.classList.contains('dropdown-hover')) {
        const show = () => this.popoverContent()?.nativeElement.showPopover();
        const hide = () => this.popoverContent()?.nativeElement.hidePopover();

        const unlistenEnter = this.renderer.listen(hostEl, 'mouseenter', show);
        const unlistenLeave = this.renderer.listen(hostEl, 'mouseleave', hide);

        onCleanup(() => {
          unlistenEnter();
          unlistenLeave();
        });
      }
    });
  }

  onPopoverToggle(event: any) {
    this.isOpen.set(event.newState === 'open');
  }

  close() {
    this.popoverContent()?.nativeElement.hidePopover();
  }
}
