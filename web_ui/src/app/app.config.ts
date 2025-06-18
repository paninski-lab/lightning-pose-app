import {
  ApplicationConfig,
  ErrorHandler,
  provideExperimentalZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { GlobalErrorHandler } from './global-error-handler.service';
import { provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    // Trying this out. It will popup any error into a dialog.
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    // will be available in angular 20
    // provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
  ],
};
