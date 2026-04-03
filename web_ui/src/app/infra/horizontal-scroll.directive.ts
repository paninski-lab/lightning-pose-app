import { Directive, ElementRef, HostListener } from '@angular/core';

@Directive({
  selector: '[appHorizontalScroll]', // This is how you'd apply it: <div appHorizontalScroll>...</div>
})
export class HorizontalScrollDirective {
  constructor(private el: ElementRef) {}

  // Listen for the 'wheel' event on the host element
  @HostListener('wheel', ['$event'])
  onWheelScroll(event: WheelEvent) {
    event.preventDefault(); // Prevent default vertical scrolling
    // Access the native DOM element and modify its scrollLeft property
    this.el.nativeElement.scrollLeft += event.deltaY;
  }
}
