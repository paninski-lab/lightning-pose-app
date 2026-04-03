import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { tap } from 'rxjs/operators';

export const storybookRecorderInterceptor: HttpInterceptorFn = (req, next) => {
  const startTime = Date.now();

  return next(req).pipe(
    tap((event) => {
      if (event instanceof HttpResponse) {
        const duration = Date.now() - startTime;
        console.log(`
/** --- COPY THIS TO YOUR STORY --- **/
export const MockResponse = {
  method: '${req.method}',
  url: '${req.url}',
  status: ${event.status},
  body: ${JSON.stringify(event.body, null, 2)},
  delay: ${duration}
};
        `);
      }
    }),
  );
};
