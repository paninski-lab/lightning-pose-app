import {
  ApplicationConfig,
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { GlobalErrorHandler } from './global-error-handler.service';
import { provideHttpClient } from '@angular/common/http';

// Import and configure Highlight.js
import hljs from 'highlight.js/lib/core';
import yaml from 'highlight.js/lib/languages/yaml';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import toml from 'highlight.js/lib/languages/ini';

hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('toml', toml);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    // Trying this out. It will popup any error into a dialog.
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
  ],
};
