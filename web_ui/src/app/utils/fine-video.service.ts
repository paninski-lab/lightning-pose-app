import { inject, Injectable, signal } from '@angular/core';
import { ProjectInfoService } from '../project-info.service';

@Injectable({
  providedIn: 'root',
})
export class FineVideoService {
  private projectInfoService = inject(ProjectInfoService);

  numPendingTranscodeTasks = signal({ pending: 0 });

  fineVideoPath(videoPath: string): string {
    return '/app/v0/files/' + videoPath;
  }
}
