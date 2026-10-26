/**
 * Frame image formats LP trains on (Pillow reads them) but the browser cannot
 * show. Keep in step with app_server/src/litpose_app/image_formats.py.
 */
const LP_ONLY_IMAGE_FORMATS: Record<string, string> = {
  '.tif': 'TIFF',
  '.tiff': 'TIFF',
  '.ppm': 'PPM',
  '.pgm': 'PGM',
  '.pbm': 'PBM',
  '.pnm': 'PNM',
  '.tga': 'TGA',
  '.jp2': 'JPEG 2000',
  '.j2k': 'JPEG 2000',
};

/** The format name ('TIFF', ...) when only LP can read this image, else null. */
export function lpOnlyImageFormat(path: string): string | null {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  return LP_ONLY_IMAGE_FORMATS[name.slice(dot).toLowerCase()] ?? null;
}

/** Same wording as the backend's lp_only_message. */
export function lpOnlyImageMessage(formatName: string): string {
  return (
    `${formatName} frames train in Lightning Pose but cannot be shown in the ` +
    'browser. Convert them to PNG to label or review them here.'
  );
}
