import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  ViewChild,
} from '@angular/core';

@Component({
  selector: 'app-terminal-output',
  standalone: true,
  templateUrl: './terminal-output.component.html',
  styleUrl: './terminal-output.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TerminalOutputComponent implements AfterViewChecked {
  lines = input<string[]>([]);
  staticHeight = input(false);

  @ViewChild('scroll') private scrollEl!: ElementRef<HTMLDivElement>;

  private lastLineCount = 0;
  private isAtBottom = true;

  ngAfterViewChecked(): void {
    const el = this.scrollEl?.nativeElement;
    if (!el) return;
    const currentCount = this.lines().length;
    if (currentCount !== this.lastLineCount) {
      this.lastLineCount = currentCount;
      if (this.isAtBottom) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }

  onScroll(event: Event): void {
    const el = event.target as HTMLDivElement;
    // Consider "at bottom" if within 4px of the bottom
    this.isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
  }
}
