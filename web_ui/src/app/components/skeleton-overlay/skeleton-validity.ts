export const SKELETON_COLOR = '#3b82f6';
export const DEFAULT_SKELETON_THICKNESS = 2;
export const MIN_SKELETON_THICKNESS = 0;
export const MAX_SKELETON_THICKNESS = 5;
export const SKELETON_THICKNESS_STEP = 0.05;
export const DEFAULT_SKELETON_OPACITY = 1;

export function clampSkeletonThickness(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SKELETON_THICKNESS;
  return Math.min(
    MAX_SKELETON_THICKNESS,
    Math.max(MIN_SKELETON_THICKNESS, value),
  );
}

/** Display label for the bone thickness slider (avoids float noise). */
export function formatSkeletonThickness(px: number): string {
  const rounded = Math.round(px * 100) / 100;
  return `${rounded}px`;
}

export function skeletonProblems(
  skeleton: unknown,
  keypointNames: readonly string[],
): string[] {
  if (skeleton == null || (Array.isArray(skeleton) && skeleton.length === 0)) {
    return [];
  }
  if (!Array.isArray(skeleton)) {
    return ['Skeleton must be a list of keypoint pairs.'];
  }

  const known = new Set(keypointNames);
  const problems: string[] = [];
  const seen = new Set<string>();
  skeleton.forEach((pair, index) => {
    if (!isNamePair(pair)) {
      problems.push(`Pair ${index + 1} must be two keypoint names.`);
      return;
    }
    const [left, right] = pair;
    if (left === right) {
      problems.push(`${left} is paired with itself.`);
    }
    if (!known.has(left)) {
      problems.push(`${left} is not a keypoint in this project.`);
    }
    if (left !== right && !known.has(right)) {
      problems.push(`${right} is not a keypoint in this project.`);
    }
    const key = [left, right].sort().join('\0');
    if (seen.has(key)) {
      problems.push(`${left} and ${right} are listed more than once.`);
    } else {
      seen.add(key);
    }
  });
  return problems;
}

/** True when a skeleton key is present and the shared check rejects it. */
export function isSkeletonDefinitionInvalid(
  skeleton: unknown,
  keypointNames: readonly string[],
): boolean {
  if (skeleton == null) return false;
  return skeletonProblems(skeleton, keypointNames).length > 0;
}

export function isNamePair(value: unknown): value is [string, string] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    typeof value[1] === 'string'
  );
}

/** Pairs from a valid skeleton. Callers skip this when the check fails. */
export function skeletonPairs(skeleton: unknown): [string, string][] {
  if (!Array.isArray(skeleton)) return [];
  return skeleton.filter(isNamePair);
}
