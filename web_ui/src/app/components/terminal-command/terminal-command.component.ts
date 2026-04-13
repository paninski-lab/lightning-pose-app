import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CopyDirective } from '../../utils/copy.directive';

@Component({
  selector: 'app-terminal-command',
  standalone: true,
  imports: [CommonModule, CopyDirective],
  template: `
    <div
      class="mockup-code before:hidden py-0 mb-4 text-md relative group/cmd cursor-pointer border border-base-content/10 hover:border-base-content/20 transition-colors"
      [appCopy]="command()"
      #copy="appCopy"
      [title]="'Click to copy command'"
    >
      <div class="overflow-x-auto py-2">
        <pre class="pl-2 pr-12"><code>{{ command() }}</code></pre>
      </div>
      <div
        class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 transition-opacity pointer-events-none"
        [class.opacity-40]="!copy.isCopied()"
        [class.group-hover/cmd:opacity-100]="!copy.isCopied()"
      >
        @if (copy.isCopied()) {
          <span
            class="text-success text-[10px] uppercase font-bold tracking-tighter"
            >Copied!</span
          >
        }
        <span
          class="material-icons text-sm!"
          [class.text-success]="copy.isCopied()"
        >
          {{ copy.isCopied() ? "check" : "content_copy" }}
        </span>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class TerminalCommandComponent {
  command = input.required<string>();
}
