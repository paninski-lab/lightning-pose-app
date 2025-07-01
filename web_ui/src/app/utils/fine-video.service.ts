import { inject, Injectable } from '@angular/core';
import { ProjectInfoService } from '../project-info.service';
import { Observable } from 'rxjs';
import { getEventStream } from './sserx';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({
  providedIn: 'root',
})
export class FineVideoService {
  private projectInfoService = inject(ProjectInfoService);

  private fineVideoStatus$ = getEventStream(
    '/app/v0/rpc/getFineVideoStatus',
  ) as Observable<FVSRpcStatus>;
  numPendingTranscodeTasks = toSignal(this.fineVideoStatus$, {
    initialValue: { pending: 0 },
  });

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

interface FVSRpcStatus {
  pending: number;
}
