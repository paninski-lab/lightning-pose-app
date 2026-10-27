/**
 * Number of training frames LP takes from `total` labeled frames. A copy of
 * `split_sizes_from_probabilities` in `lightning_pose/data/utils.py`, with
 * the test fraction left as what train and val don't use.
 * Returns 0 when LP would refuse to split (fewer than two frames).
 */
export function lpTrainFrameCount(
  total: number,
  trainProb: number,
  valProb: number,
): number {
  let train = Math.floor(trainProb * total);
  let val = Math.floor(valProb * total);
  const leftover = total - train - val;
  if (leftover < 5) {
    train += leftover;
  }
  if (val === 0) {
    train -= 1;
    val += 1;
  }
  return train < 1 ? 0 : train;
}

/**
 * Fewest labeled frames for which Pose PCA can fit. LP needs at least as many
 * training frames as PCA dimensions, 2 per keypoint used
 * (`lightning_pose/utils/pca.py`, "cannot fit PCA with N samples < D").
 */
export function minFramesForPosePca(
  numKeypoints: number,
  trainProb: number,
  valProb: number,
): number {
  const dims = 2 * numKeypoints;
  let total = Math.max(2, Math.ceil(dims / trainProb));
  // The split floors and adjusts, so step down and up to the exact boundary.
  while (
    total > 2 &&
    lpTrainFrameCount(total - 1, trainProb, valProb) >= dims
  ) {
    total--;
  }
  while (lpTrainFrameCount(total, trainProb, valProb) < dims) {
    total++;
  }
  return total;
}
