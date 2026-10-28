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

  // Projects page "Show details" toggle. On unless the user turned it off.
  private _showProjectDetails = signal<boolean>(
    localStorage.getItem('showProjectDetails') !== 'false',
  );

  showProjectDetails = this._showProjectDetails.asReadonly();

  /** Persist value and update the showProjectDetails signal. */
  setShowProjectDetails(value: boolean): void {
    this._showProjectDetails.set(value);
    localStorage.setItem('showProjectDetails', String(value));
  }
}
