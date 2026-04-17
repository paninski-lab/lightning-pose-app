import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { interval, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export type TaskType = 'inference' | 'training';

export interface ActiveTaskResponse {
  taskId: string | null;
  type?: TaskType;
}

@Injectable({
  providedIn: 'root',
})
export class ActiveTaskService {
  private http = inject(HttpClient);

  activeTask = signal<ActiveTaskResponse | null>(null);

  constructor() {
    // Poll every 5 seconds for active task
    interval(5000)
      .pipe(
        startWith(0),
        switchMap(() => this.http.get<ActiveTaskResponse>('/app/v0/task/active')),
        takeUntilDestroyed()
      )
      .subscribe((response) => {
        this.activeTask.set(response.taskId ? response : null);
      });
  }
}
