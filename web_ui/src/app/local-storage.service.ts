import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
/** Persists and exposes UI preference flags to localStorage. */
export class LocalStorageService {
  private _hasSeenDiscordTooltip = signal<boolean>(
    localStorage.getItem('hasSeenDiscordTooltip') === 'true',
  );

  hasSeenDiscordTooltip = this._hasSeenDiscordTooltip.asReadonly();

  /** Persist value and update the hasSeenDiscordTooltip signal. */
  setHasSeenDiscordTooltip(value: boolean): void {
    this._hasSeenDiscordTooltip.set(value);
    localStorage.setItem('hasSeenDiscordTooltip', String(value));
  }
}
