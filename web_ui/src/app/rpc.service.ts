import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class RpcService {
  private http = inject(HttpClient);

  call(method: string, params?: any): Promise<any> {
    /**
     * Makes an RPC to the fastapi server.
     *
     * Uses angular http client under the hood.
     *
     * Throws angular HttpErrorResponse if there's a
     * server error or connection error, which will get handled
     * by the global error handler.
     *
     * Converts http client's native return type of Observable,
     * to the simpler interface, Promise. But I might regret
     * this and wish I had directly returned the observable.
     */
    const observable = this.http.post(`/app/v0/rpc/${method}`, params ?? null, {
      headers: { 'Content-type': 'application/json' },
    });
    return firstValueFrom(observable);
  }
}
