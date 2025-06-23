export interface Session {
  key: string;
  views: SessionView[];
}

export interface SessionView {
  viewName: string;
  videoPath: string;
}
