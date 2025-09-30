import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class RpcService {
  private http = inject(HttpClient);

  callObservable(method: string, params?: any): Observable<unknown> {
    return this.http.post(`/app/v0/rpc/${method}`, params ?? null, {
      headers: { 'Content-type': 'application/json' },
    });
  }
  call(method: string, params?: any): Promise<unknown> {
    const observable = this.callObservable(method, params);
    return firstValueFrom(observable);
  }
}
