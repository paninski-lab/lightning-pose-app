export interface SkeletonEndpoint {
  name: string;
  x: number;
  y: number;
  visible?: boolean;
  modelKey?: string;
  view?: string;
}

export interface SkeletonSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Bones for a valid skeleton. Does not re-check the skeleton rules. */
export function skeletonBones(
  pairs: readonly (readonly [string, string])[],
  endpoints: readonly SkeletonEndpoint[],
): SkeletonSegment[] {
  const groups = new Map<string, SkeletonEndpoint[]>();
  for (const endpoint of endpoints) {
    const key = `${endpoint.view ?? ''}\0${endpoint.modelKey ?? ''}`;
    const group = groups.get(key);
    if (group) group.push(endpoint);
    else groups.set(key, [endpoint]);
  }

  const segments: SkeletonSegment[] = [];
  for (const group of groups.values()) {
    for (const [leftName, rightName] of pairs) {
      const left = drawable(group, leftName);
      const right = drawable(group, rightName);
      if (!left || !right) continue;
      segments.push({ x1: left.x, y1: left.y, x2: right.x, y2: right.y });
    }
  }
  return segments;
}

function drawable(
  group: readonly SkeletonEndpoint[],
  name: string,
): SkeletonEndpoint | undefined {
  const found = group.find((endpoint) => endpoint.name === name);
  if (!found || found.visible === false) return undefined;
  if (!Number.isFinite(found.x) || !Number.isFinite(found.y)) return undefined;
  return found;
}
