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
