import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
/** Thin wrapper around HttpClient for all backend RPC calls via POST /app/v0/rpc/<Method>. */
export class RpcService {
  private http = inject(HttpClient);

  /** Return an Observable for a POST to /app/v0/rpc/<method> with the given params. */
  callObservable(method: string, params?: any): Observable<unknown> {
    return this.http.post(`/app/v0/rpc/${method}`, params ?? null, {
      headers: { 'Content-type': 'application/json' },
    });
  }
  /** Resolve a POST to /app/v0/rpc/<method> with the given params and return the response. */
  call(method: string, params?: any): Promise<unknown> {
    const observable = this.callObservable(method, params);
    return firstValueFrom(observable);
  }
}
