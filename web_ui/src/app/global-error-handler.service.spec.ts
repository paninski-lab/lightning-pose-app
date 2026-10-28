import { TestBed } from '@angular/core/testing';

import { GlobalErrorHandler } from './global-error-handler.service';
import { LoadingService } from './loading.service';
import { ErrorDialogService } from './error-dialog.service';

describe('GlobalErrorHandler', () => {
  let service: GlobalErrorHandler;

  beforeEach(() => {
    const loadingServiceSpy = {
      isLoading: {
        set: jasmine.createSpy('set'),
      },
    };
    const errorDialogServiceSpy = {
      openDialog: jasmine.createSpy('openDialog'),
    };

    TestBed.configureTestingModule({
      providers: [
        GlobalErrorHandler,
        { provide: LoadingService, useValue: loadingServiceSpy },
        { provide: ErrorDialogService, useValue: errorDialogServiceSpy },
      ],
    });
    service = TestBed.inject(GlobalErrorHandler);
  });

  it('should not crash if umami is not defined', () => {
    const error = new Error('Test error');
    delete window.umami;

    spyOn(console, 'error');
    expect(() => service.handleError(error)).not.toThrow();
  });
});
