/**
 * Split a multiview file or folder name into session and view.
 *
 * A multiview name is `<session>_<view>`: the view is everything after the
 * **last** `_`. LP reads `labeled-data/<session>_<view>/` folders the same way,
 * and the backend uses the same rule (`app_server/src/litpose_app/session_view.py`).
 * A view name that contains `_` can't be read back from a name.
 */

/** `{session, view}` split at the last `_`, without checking the view; null if there is none. */
export function rsplitSessionView(
  stem: string,
): { session: string; view: string } | null {
  const i = stem.lastIndexOf('_');
  if (i <= 0 || i === stem.length - 1) return null;
  return { session: stem.slice(0, i), view: stem.slice(i + 1) };
}

/**
 * `{session, view}` when `stem` ends in `_<view>` for one of `views`; null for
 * a single-view project or when the part after the last `_` is not a project view.
 */
export function splitSessionView(
  stem: string,
  views: readonly string[],
): { session: string; view: string } | null {
  if (views.length === 0) return null;
  const parts = rsplitSessionView(stem);
  return parts && views.includes(parts.view) ? parts : null;
}

/**
 * Group key and view of a file name (`trial_top.mp4` → `trial_*.mp4`, `top`).
 * The extension stays on the key. Null when the name has no project view.
 */
export function sessionViewKey(
  filename: string,
  views: readonly string[],
): { key: string; view: string } | null {
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  const parts = splitSessionView(stem, views);
  return parts ? { key: `${parts.session}_*${ext}`, view: parts.view } : null;
}

/**
 * Key that pairs the views of one labeled frame: the `<session>_<view>`
 * folder becomes `<session>_*`. The path itself when its folder doesn't end in `_<viewName>`.
 */
export function framePathKey(imgPath: string, viewName: string): string {
  const parts = imgPath.split('/');
  if (parts.length < 2) return imgPath;
  const folder = splitSessionView(parts[parts.length - 2], [viewName]);
  if (!folder) return imgPath;
  parts[parts.length - 2] = `${folder.session}_*`;
  return parts.join('/');
}

/** View names that contain `_`, which can't be read back from a `<session>_<view>` file name. */
export function viewsWithUnderscore(views: readonly string[]): string[] {
  return views.filter((v) => v.includes('_'));
}

/** Same text as the backend's `view_underscore_message`. */
export function viewUnderscoreMessage(names: readonly string[]): string {
  return (
    `View names can't contain _ (${names.join(', ')}), because video and folder ` +
    'names are split at the last _. Use - instead (for example cam-top).'
  );
}
