import { TestBed } from '@angular/core/testing';
import { DaisyFormControlDirective } from './daisy-form-control.directive';
import { NgControl } from '@angular/forms';
import { ElementRef, Renderer2 } from '@angular/core';

describe('DaisyFormControlDirective', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: NgControl,
          useValue: {
            control: { invalid: false, touched: false, dirty: false },
          },
        },
        {
          provide: ElementRef,
          useValue: { nativeElement: document.createElement('div') },
        },
        {
          provide: Renderer2,
          useValue: { addClass: () => {}, removeClass: () => {} },
        },
        DaisyFormControlDirective,
      ],
    });
  });

  it('should create an instance', () => {
    const directive = TestBed.runInInjectionContext(
      () => new DaisyFormControlDirective(),
    );
    expect(directive).toBeTruthy();
  });
});
