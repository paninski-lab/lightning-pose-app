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

/** Mark rows the cache still accepts. Omitted paths stay not checked. */
export function applyCachedChecks<
  T extends { path: string; issues: string[]; warnings: string[]; checked: boolean },
>(rows: readonly T[], items: readonly FileCheckResult[]): T[] {
  const byPath = new Map(items.map((item) => [item.path, item]));
  return rows.map((row) => {
    const item = byPath.get(row.path);
    if (!item) {
      return { ...row, issues: [], warnings: [], checked: false };
    }
    return {
      ...row,
      issues: item.issues,
      warnings: item.warnings ?? [],
      checked: true,
    };
  });
}

export async function fetchCachedFileChecks(
  call: (method: string, params?: unknown) => Promise<unknown>,
  projectKey: string,
  sector: string,
): Promise<FileCheckResult[]> {
  try {
    const response = (await call('cachedProjectFileChecks', {
      projectKey,
      sector,
    })) as { items?: FileCheckResult[] };
    return response.items ?? [];
  } catch {
    return [];
  }
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
