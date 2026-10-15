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

/** Project camera names this session does not include. Empty when extraction can proceed. */
export function missingSessionViews(
  session: Session,
  projectViews: readonly string[],
): string[] {
  if (projectViews.length > 1) {
    const present = new Set(session.views.map((view) => view.viewName));
    return projectViews.filter((name) => !present.has(name));
  }
  return session.views.length === 1 ? [] : ['one camera'];
}
