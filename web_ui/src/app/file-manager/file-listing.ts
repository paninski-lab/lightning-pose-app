export interface RGlobEntry {
  path: string;
  type?: 'dir' | 'file' | null;
}

export interface RGlobResponse {
  entries: RGlobEntry[];
  relativeTo: string;
}

export interface FileCheckResult {
  path: string;
  issues: string[];
  warnings: string[];
}

export function joinPath(dir: string, relative: string): string {
  return `${dir.replace(/\/$/, '')}/${relative.replace(/^\//, '')}`;
}

export function isUnderDir(path: string, root: string): boolean {
  const base = root.replace(/\/$/, '');
  const candidate = path.replace(/\/$/, '');
  return candidate === base || candidate.startsWith(`${base}/`);
}

export function rpcErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { error?: { detail?: string } })?.error?.detail;
  if (typeof detail === 'string' && detail) return detail;
  const message = (err as { message?: string })?.message;
  return message || fallback;
}
