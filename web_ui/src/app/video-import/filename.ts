const ALLOWED_FILENAME = /^[a-zA-Z0-9\-_.]+$/;

export interface ParsedVideoName {
  ext: string | null;
  sessionKey: string | null;
  view: string | null;
  /** Structural problem (missing extension, bad characters, wrong session/view shape). */
  error: string | null;
  /** View segment is not one of the project's configured views. */
  warning: string | null;
}

/**
 * Validate a video filename against the project view setup.
 * Single-view: `session.ext`. Multiview: `session_view.ext` (split on the last `_`).
 */
export function parseVideoFilename(
  filename: string,
  options: { isMultiview: boolean; views?: readonly string[] },
): ParsedVideoName {
  const { baseName, ext } = splitExtension(filename);
  let error: string | null = null;
  let sessionKey: string | null = null;
  let view: string | null = null;

  if (!baseName || !ext) {
    error = 'Filename must include an extension';
  } else if (!ALLOWED_FILENAME.test(baseName)) {
    error = 'Filename contains invalid characters';
  } else if (options.isMultiview) {
    if (baseName.indexOf('_') === -1) {
      error = 'Filename must be of the form session_view.ext';
    } else {
      const lastUnderscore = baseName.lastIndexOf('_');
      sessionKey = baseName.substring(0, lastUnderscore);
      view = baseName.substring(lastUnderscore + 1);
      if (!sessionKey) {
        error = 'Missing session name before underscore';
      } else if (!view) {
        error = 'Missing view name after underscore';
      }
    }
  } else {
    sessionKey = baseName;
    view = null;
  }

  let warning: string | null = null;
  const views = options.views ?? [];
  if (
    error === null &&
    options.isMultiview &&
    view &&
    views.length > 0 &&
    !views.includes(view)
  ) {
    warning = `Unknown view: ${view}`;
  }

  return { ext, sessionKey, view, error, warning };
}

export function splitExtension(filename: string): {
  baseName: string;
  ext: string | null;
} {
  const idx = filename.lastIndexOf('.');
  if (idx <= 0 || idx === filename.length - 1) {
    return { baseName: filename, ext: null };
  }
  return {
    baseName: filename.substring(0, idx),
    ext: filename.substring(idx + 1),
  };
}
