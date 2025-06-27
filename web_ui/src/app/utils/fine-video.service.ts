import { inject, Injectable } from '@angular/core';
import { ProjectInfoService } from '../project-info.service';

@Injectable({
  providedIn: 'root',
})
export class FineVideoService {
  private projectInfoService = inject(ProjectInfoService);

  fineVideoPath(videoPath: string): string {
    if (!this.projectInfoService.fineVideoDir) {
      throw new Error(
        'ProjectInfoService.fineVideoDir called but not yet initialized',
      );
    }
    const filename = videoPath.split('/').pop()!;
    return (
      '/app/v0/files/' + this.projectInfoService.fineVideoDir + '/' + filename
    );
  }
}
