import { TestBed } from '@angular/core/testing';

import { GlobalErrorHandler } from './global-error-handler.service';
import { LoadingService } from './loading.service';
import { ErrorDialogService } from './error-dialog.service';

describe('GlobalErrorHandler', () => {
  let service: GlobalErrorHandler;
  let loadingService: LoadingService;
  let errorDialogService: ErrorDialogService;

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
    loadingService = TestBed.inject(LoadingService);
    errorDialogService = TestBed.inject(ErrorDialogService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should call umami.track when handleError is called', () => {
    const error = new Error('Test error');
    window.umami = {
      track: jasmine.createSpy('track'),
      identify: jasmine.createSpy('identify'),
    };

    service.handleError(error);

    expect(window.umami.track).toHaveBeenCalledWith('error', {
      message: 'Test error',
      stack: error.stack,
    });
  });

  it('should not crash if umami is not defined', () => {
    const error = new Error('Test error');
    delete window.umami;

    expect(() => service.handleError(error)).not.toThrow();
  });
});
