import { ErrorHandler, inject, Injectable } from '@angular/core';
import { ErrorDialogService } from './error-dialog.service';
import { LoadingService } from './loading.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private loadingService = inject(LoadingService);

  constructor(private errorDialogService: ErrorDialogService) {
    // Get rid of all this stuff in angular 20:
    // https://github.com/angular/angular/issues/56240
    window.onerror = (error: unknown) => {
      this.handleError(error);
    };
    window.onunhandledrejection = (event: PromiseRejectionEvent) => {
      // event.reason should be some Error object.
      this.handleError(event.reason);
    };
  }

  handleError(error: any) {
    this.loadingService.isLoading.set(false);
    this.errorDialogService.openDialog(error);

    console.error(error);
  }
}
