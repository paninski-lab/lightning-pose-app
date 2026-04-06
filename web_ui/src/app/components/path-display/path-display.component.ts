import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CopyDirective } from '../../utils/copy.directive';

@Component({
  selector: 'app-path-display',
  standalone: true,
  imports: [CommonModule, CopyDirective],
  template: `
    <div class="flex items-center gap-2 group/path">
      @if (label) {
        <span class="text-xs font-medium opacity-60 uppercase tracking-wider">{{
          label
        }}</span>
      }
      <div
        class="bg-base-content/5 hover:bg-base-content/10 px-2 py-1 rounded font-mono text-xs flex items-center gap-2 cursor-pointer transition-colors border border-transparent hover:border-base-content/10"
        [appCopy]="path"
        #copy="appCopy"
        [attr.aria-label]="'Copy ' + (label || 'path')"
        [title]="path"
      >
        <span class="truncate select-all max-w-xs md:max-w-md">{{ path }}</span>
        <span
          class="material-icons text-sm! transition-opacity shrink-0"
          [class.text-success]="copy.isCopied()"
          [class.opacity-40]="!copy.isCopied()"
          [class.group-hover/path:opacity-100]="!copy.isCopied()"
        >
          {{ copy.isCopied() ? 'check' : 'content_copy' }}
        </span>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }
    `,
  ],
})
export class PathDisplayComponent {
  @Input({ required: true }) path!: string;
  @Input() label?: string;
}
