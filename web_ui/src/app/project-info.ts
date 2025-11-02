export class ProjectInfo {
  project_key: string;
  // absolute path on server filesystem
  data_dir: string;
  // absolute path on server filesystem
  model_dir: string;
  views: string[];
  keypoint_names: string[];

  constructor(projectInfo: Partial<ProjectInfo>) {
    this.project_key = String(projectInfo.project_key);
    this.data_dir = String(projectInfo.data_dir);
    this.model_dir = String(projectInfo.model_dir);
    this.views = projectInfo.views ?? [];
    this.keypoint_names = projectInfo.keypoint_names ?? [];
  }
}
