import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LoadingService {
  isLoading = signal(false);
  loadingText = signal('Loading');
  maxProgress = signal(100);
  progress = signal(0);
}
