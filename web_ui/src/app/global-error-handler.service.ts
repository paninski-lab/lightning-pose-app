import { ErrorHandler, inject, Injectable } from '@angular/core';
import { ErrorDialogService } from './error-dialog.service';
import { LoadingService } from './loading.service';

@Injectable()
/** Angular ErrorHandler: clears the loading overlay and shows uncaught errors in a modal. */
export class GlobalErrorHandler implements ErrorHandler {
  private loadingService = inject(LoadingService);
  private errorDialogService = inject(ErrorDialogService);

  /** Hide the loading overlay, open the error dialog, log to console, and track in Umami. */
  handleError(error: any) {
    this.loadingService.isLoading.set(false);
    this.errorDialogService.openDialog(error);

    console.error(error);

    window.umami?.track('error', {
      message: error?.message || error?.toString() || 'Unknown error',
      stack: error?.stack || 'No stack trace available',
    });
  }
}
