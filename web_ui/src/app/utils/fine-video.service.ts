import { inject, Injectable, signal } from '@angular/core';
import { ProjectInfoService } from '../project-info.service';

@Injectable({
  providedIn: 'root',
})
/** Provides helpers for accessing transcoded "fine" video files served by the backend. */
export class FineVideoService {
  private projectInfoService = inject(ProjectInfoService);

  numPendingTranscodeTasks = signal({ pending: 0 });

  /** Return the server URL for a transcoded video file at the given absolute path. */
  fineVideoPath(videoPath: string): string {
    return '/app/v0/files/' + videoPath;
  }
}
