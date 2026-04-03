import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HighlightDirective } from './highlight.directive';

describe('HighlightDirective', () => {
  it('should create an instance', () => {
    const mockElementRef = { nativeElement: {} } as ElementRef;
    TestBed.configureTestingModule({
      providers: [
        { provide: ElementRef, useValue: mockElementRef },
        HighlightDirective,
      ],
    });
    const directive = TestBed.runInInjectionContext(
      () => new HighlightDirective(mockElementRef),
    );
    expect(directive).toBeTruthy();
  });
});
