// src/app/highlight.directive.ts
import { Directive, ElementRef, input, OnChanges } from '@angular/core';
import hljs from 'highlight.js/lib/core';

@Directive({
  selector: '[appHighlight]',
  standalone: true, // Mark as standalone
})
export class HighlightDirective implements OnChanges {
  // Input for the content you want to highlight
  code = input.required<string>({ alias: 'appHighlight' });

  // Input to specify the language (optional, defaults to 'yaml')
  // (You'll need to initialize more languages in app.component.ts)
  language = input<string>('yaml');

  constructor(private el: ElementRef) {}

  ngOnChanges() {
    const element = this.el.nativeElement;

    if (element) {
      const highlightedCode = hljs.highlight(this.code(), {
        language: this.language(),
      }).value;
      element.innerHTML = highlightedCode;
    }
  }
}
