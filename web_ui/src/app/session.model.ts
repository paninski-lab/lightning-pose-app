export interface Session {
  key: string;
  // Path relative to data dir. View is stripped out in sessionKey style.
  relativePath: string;
  views: SessionView[];
}

export interface SessionView {
  viewName: string;
  videoPath: string;
}
