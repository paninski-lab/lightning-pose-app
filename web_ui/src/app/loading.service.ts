import { Injectable, signal } from '@angular/core';
import { Router, ResolveEnd, ResolveStart } from '@angular/router';
import { inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class LoadingService {
  isLoading = signal(false);
  loadingText = signal('Loading');
  maxProgress = signal(100);
  progress = signal(0);

  // Tracks Angular Router resolver activity
  isContextLoading = signal(false);

  private router = inject(Router);

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof ResolveStart) {
        this.isContextLoading.set(true);
      } else if (event instanceof ResolveEnd) {
        this.isContextLoading.set(false);
      }
    });
  }
}
