import {
  Component,
  contentChild,
  effect,
  ElementRef,
  HostListener,
  inject,
  Renderer2,
  input,
  signal,
} from '@angular/core';

import { Directive } from '@angular/core';

@Directive({
  selector: '[appDropdownTrigger]',
  standalone: true,
})
export class DropdownTriggerDirective {}

@Component({
  selector: 'app-dropdown-trigger',
  standalone: true,
  template: `<ng-content></ng-content>`,
})
export class DropdownTriggerComponent {}

@Component({
  selector: 'app-dropdown-content',
  standalone: true,
  template: `<ng-content></ng-content>`,
})
export class DropdownContentComponent {}

@Component({
  selector: 'app-dropdown',
  standalone: true,
  template: `
    <div
      class="dropdown dropdown-no-focus"
      [class.dropdown-open]="isOpen()"
      [class.dropdown-end]="alignEnd()"
    >
      <ng-content select="app-dropdown-trigger"></ng-content>
      <div
        class="dropdown-content z-[50] bg-base-200 rounded-box shadow border border-base-300"
      >
        <ng-content select="app-dropdown-content"></ng-content>
      </div>
    </div>
  `,
  styles: [],
})
export class DropdownComponent {
  private renderer = inject(Renderer2);
  isOpen = signal(false);
  alignEnd = input(false);
  trigger = contentChild(DropdownTriggerDirective, { read: ElementRef });

  constructor() {
    // Automatically manage the event listener when the trigger is available
    effect((onCleanup) => {
      const triggerEl = this.trigger()?.nativeElement;

      if (triggerEl) {
        const unlisten = this.renderer.listen(triggerEl, 'click', () => {
          this.isOpen.update((v) => !v);
        });

        // Clean up listener if the component or trigger is destroyed
        onCleanup(() => unlisten());
      }
    });
  }

  close() {
    this.isOpen.set(false);
  }

  private eRef = inject(ElementRef);

  // Closes if the click target is NOT inside this component's element
  @HostListener('document:click', ['$event'])
  clickout(event: Event) {
    if (!this.eRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }
}
