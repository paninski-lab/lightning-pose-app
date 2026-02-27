import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LocalStorageService {
  private _hasSeenDiscordTooltip = signal<boolean>(
    localStorage.getItem('hasSeenDiscordTooltip') === 'true',
  );

  hasSeenDiscordTooltip = this._hasSeenDiscordTooltip.asReadonly();

  setHasSeenDiscordTooltip(value: boolean): void {
    this._hasSeenDiscordTooltip.set(value);
    localStorage.setItem('hasSeenDiscordTooltip', String(value));
  }
}
