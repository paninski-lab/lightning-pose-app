/**
 * Views shown in the Viewer's Views panel. `ProjectInfoService.allViews` ends
 * with an "unknown" placeholder for files whose name has no project view. Those
 * videos are kept out of sessions, so the placeholder is never a view the user
 * can show or hide.
 */
export function listedViews(allViews: readonly string[]): string[] {
  return allViews.filter((view) => view !== 'unknown');
}
