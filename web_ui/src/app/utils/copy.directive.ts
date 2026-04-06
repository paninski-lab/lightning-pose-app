import {
  Directive,
  EventEmitter,
  HostListener,
  Input,
  Output,
  signal,
} from '@angular/core';

@Directive({
  selector: '[appCopy]',
  standalone: true,
  exportAs: 'appCopy',
})
export class CopyDirective {
  @Input('appCopy') value = '';
  @Output() copied = new EventEmitter<void>();

  readonly isCopied = signal(false);
  private timeoutId?: any;

  @HostListener('click', ['$event'])
  async onClick(event: MouseEvent) {
    event.stopPropagation();
    if (!this.value) return;

    try {
      await navigator.clipboard.writeText(this.value);
      this.isCopied.set(true);
      this.copied.emit();

      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }

      this.timeoutId = setTimeout(() => {
        this.isCopied.set(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  }
}
