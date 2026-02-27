import { Directive } from '@angular/core';
import { ViewportContextService } from './viewport-context.service';

@Directive({
  selector: '[appViewportContext]',
  standalone: true,
  providers: [ViewportContextService],
})
export class ViewportContextDirective {}
