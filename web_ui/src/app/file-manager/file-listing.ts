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

/** Keep paths already on screen in that order. Paths only in `items` follow them. */
export function keepCurrentPathOrder<T extends { path: string }>(
  currentPaths: readonly string[],
  items: readonly T[],
): T[] {
  const byPath = new Map(items.map((item) => [item.path, item]));
  const ordered: T[] = [];
  for (const path of currentPaths) {
    const item = byPath.get(path);
    if (!item) continue;
    ordered.push(item);
    byPath.delete(path);
  }
  for (const item of items) {
    if (byPath.has(item.path)) ordered.push(item);
  }
  return ordered;
}

export function rpcErrorMessage(err: unknown, fallback: string): string {
  const detail = (err as { error?: { detail?: string } })?.error?.detail;
  if (typeof detail === 'string' && detail) return detail;
  const message = (err as { message?: string })?.message;
  return message || fallback;
}
