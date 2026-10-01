export class ProjectInfo {
  // absolute path on server filesystem
  data_dir: string;
  // absolute path on server filesystem
  model_dir: string;
  views: string[];
  keypoint_names: string[];
  /** Raw project.yaml value. null means the key is absent. */
  skeleton: unknown;

  constructor(projectInfo: Partial<ProjectInfo>) {
    this.data_dir = String(projectInfo.data_dir);
    this.model_dir = String(projectInfo.model_dir);
    this.views = projectInfo.views ?? [];
    this.keypoint_names = projectInfo.keypoint_names ?? [];
    this.skeleton = projectInfo.skeleton ?? null;
  }
}
