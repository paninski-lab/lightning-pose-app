/**
 * Why LP would refuse horizontal flip (`training.imgaug_hflip`) for these
 * keypoints, or null. LP swaps each `<name>_left` with `<name>_right` when it
 * flips an image, so every `_left` keypoint needs a `_right` partner and the
 * other way round (`lightning_pose/data/datasets.py`). Keypoints without these
 * suffixes are fine.
 */
export function hflipPairProblem(
  keypointNames: readonly string[],
): string | null {
  const lefts = new Set(
    keypointNames.filter((n) => n.endsWith('_left')).map((n) => n.slice(0, -5)),
  );
  const rights = new Set(
    keypointNames
      .filter((n) => n.endsWith('_right'))
      .map((n) => n.slice(0, -6)),
  );
  const unpaired = [
    ...[...lefts].filter((b) => !rights.has(b)).map((b) => `${b}_left`),
    ...[...rights].filter((b) => !lefts.has(b)).map((b) => `${b}_right`),
  ].sort();
  if (!unpaired.length) return null;
  return `Horizontal flip needs every _left keypoint to have a _right partner and the other way round. Unpaired: ${unpaired.join(', ')}.`;
}
