import { inject, Injectable } from '@angular/core';
import { RpcService } from './rpc.service';
import { ProjectInfoService } from './project-info.service';

interface RGlobResponse {
  entries: { path: string; type?: 'dir' | 'file' }[];
  relativeTo: string;
}

@Injectable({
  providedIn: 'root',
})
/** Queries the project data directory for camera calibration TOML files. */
export class CameraCalibrationService {
  private rpc = inject(RpcService);
  private projectInfoService = inject(ProjectInfoService);

  /** Return whether a session has a session-level, project-level, or no calibration file. */
  async getCalibrationStatus(
    sessionKey: string,
  ): Promise<'session' | 'project' | 'none'> {
    const projectInfo = this.projectInfoService.projectInfo;

    // Search for session-level calibration file.
    let response = (await this.rpc.call('rglob', {
      baseDir: projectInfo.data_dir,
      pattern: `calibrations/${sessionKey}.toml`,
      noDirs: true,
    })) as RGlobResponse;
    if (response.entries.length > 0) {
      return 'session';
    }

    // Search for project-level calibration file.
    response = (await this.rpc.call('rglob', {
      baseDir: projectInfo.data_dir,
      pattern: `calibration.toml`,
      noDirs: true,
    })) as RGlobResponse;
    if (response.entries.length > 0) {
      return 'project';
    }

    return 'none';
  }

  /** Return true if any project-level or session-level calibration TOML file exists. */
  async projectHasCalibrations(): Promise<boolean> {
    const projectInfo = this.projectInfoService.projectInfo;

    // Check for project-level calibration file.
    let response = (await this.rpc.call('rglob', {
      baseDir: projectInfo.data_dir,
      pattern: `calibration.toml`,
      noDirs: true,
    })) as RGlobResponse;
    if (response.entries.length > 0) {
      return true;
    }

    // Check for any session-level calibration files.
    response = (await this.rpc.call('rglob', {
      baseDir: projectInfo.data_dir,
      pattern: `calibrations/*.toml`,
      noDirs: true,
    })) as RGlobResponse;
    return response.entries.length > 0;
  }
}
