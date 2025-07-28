import { ErrorHandler, inject, Injectable } from '@angular/core';
import { ErrorDialogService } from './error-dialog.service';
import { LoadingService } from './loading.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private loadingService = inject(LoadingService);
  private errorDialogService = inject(ErrorDialogService);

  handleError(error: any) {
    this.loadingService.isLoading.set(false);
    this.errorDialogService.openDialog(error);

    console.error(error);
  }
}
