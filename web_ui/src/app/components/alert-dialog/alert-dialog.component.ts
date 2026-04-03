import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  output,
} from '@angular/core';

@Component({
  selector: 'app-alert-header',
  template: `<h3 class="font-bold text-lg"><ng-content /></h3>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertHeaderComponent {}

@Component({
  selector: 'app-alert-footer',
  template: `<div class="modal-action"><ng-content /></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertFooterComponent {}

@Component({
  selector: 'app-alert-dialog',
  template: `
    <dialog class="modal modal-open">
      <div class="modal-box max-w-2xl">
        <ng-content select="app-alert-header" />
        <div class="py-4 max-w-none">
          <ng-content />
        </div>
        <ng-content select="app-alert-footer" />
      </div>
      <form method="dialog" class="modal-backdrop">
        <button (click)="close.emit()">close</button>
      </form>
    </dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertDialogComponent {
  close = output<void>();

  @HostListener('window:keydown.escape')
  onEscape() {
    this.close.emit();
  }
}
