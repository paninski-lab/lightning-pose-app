/**
 * Settings in an LP training config that count in epochs and are tuned for
 * the config's `max_epochs`. When the user picks a different number of
 * epochs, these are scaled by the same factor, so a 100-epoch model drops its
 * learning rate at 50/67/83 instead of 150/200/250 (which LP rejects).
 */
export interface EpochSchedule {
  maxEpochs: number;
  unfreezingEpoch?: number;
  milestones?: number[];
  patchMask?: { initEpoch: number; finalEpoch: number };
  annealFreezeUntilEpoch?: number;
}

type Config = Record<string, any>;

/**
 * Read the epoch-counted settings from a base config. Returns null when the
 * config counts in steps (`max_steps`) or has no `max_epochs`; those are left alone.
 */
export function readEpochSchedule(
  config: Config | null | undefined,
): EpochSchedule | null {
  const training = config?.['training'];
  if (!training || 'max_steps' in training) return null;
  const maxEpochs = training['max_epochs'];
  if (typeof maxEpochs !== 'number' || maxEpochs <= 0) return null;

  const schedule: EpochSchedule = { maxEpochs };
  if (typeof training['unfreezing_epoch'] === 'number') {
    schedule.unfreezingEpoch = training['unfreezing_epoch'];
  }
  const milestones =
    training['lr_scheduler_params']?.['multisteplr']?.['milestones'];
  if (
    training['lr_scheduler'] === 'multisteplr' &&
    Array.isArray(milestones) &&
    milestones.every((m) => typeof m === 'number')
  ) {
    schedule.milestones = milestones;
  }
  const patchMask = training['patch_mask'];
  if (
    typeof patchMask?.['init_epoch'] === 'number' &&
    typeof patchMask?.['final_epoch'] === 'number'
  ) {
    schedule.patchMask = {
      initEpoch: patchMask['init_epoch'],
      finalEpoch: patchMask['final_epoch'],
    };
  }
  const freeze =
    config?.['callbacks']?.['anneal_weight']?.['freeze_until_epoch'];
  if (typeof freeze === 'number') {
    schedule.annealFreezeUntilEpoch = freeze;
  }
  return schedule;
}

/**
 * Scale a schedule to `epochs`, in whole epochs:
 * - `unfreezingEpoch` is at least 1 and below `epochs` when there is room.
 * - Milestones stay strictly increasing, after the unfreezing epoch, and
 *   `<= epochs` (LP's check), as far as `epochs` leaves room.
 * At the schedule's own `maxEpochs` the values are unchanged.
 */
export function scaleEpochSchedule(
  schedule: EpochSchedule,
  epochs: number,
): EpochSchedule {
  const factor = epochs / schedule.maxEpochs;
  const scale = (value: number) => Math.round(value * factor);
  const scaled: EpochSchedule = { maxEpochs: epochs };

  if (schedule.unfreezingEpoch !== undefined) {
    scaled.unfreezingEpoch =
      factor === 1
        ? schedule.unfreezingEpoch
        : clamp(scale(schedule.unfreezingEpoch), 1, Math.max(epochs - 1, 1));
  }
  if (schedule.milestones !== undefined) {
    scaled.milestones =
      factor === 1
        ? [...schedule.milestones]
        : spreadMilestones(
            schedule.milestones.map(scale),
            scaled.unfreezingEpoch ?? 0,
            epochs,
          );
  }
  if (schedule.patchMask !== undefined) {
    const initEpoch = clamp(scale(schedule.patchMask.initEpoch), 0, epochs);
    scaled.patchMask = {
      initEpoch,
      finalEpoch: clamp(
        scale(schedule.patchMask.finalEpoch),
        initEpoch,
        epochs,
      ),
    };
  }
  if (schedule.annealFreezeUntilEpoch !== undefined) {
    scaled.annealFreezeUntilEpoch = clamp(
      scale(schedule.annealFreezeUntilEpoch),
      0,
      epochs,
    );
  }
  return scaled;
}

/**
 * Config patch that writes `epochs` and the schedule scaled to it. With no
 * schedule (a step-based base config), returns an empty patch: writing
 * epochs into a step-based config would fail LP's steps-vs-epochs check.
 */
export function epochSchedulePatch(
  base: EpochSchedule | null,
  epochs: number,
): Config {
  if (!base) return {};
  const s = scaleEpochSchedule(base, epochs);
  const training: Config = { min_epochs: epochs, max_epochs: epochs };
  if (s.unfreezingEpoch !== undefined)
    training['unfreezing_epoch'] = s.unfreezingEpoch;
  if (s.milestones !== undefined) {
    training['lr_scheduler_params'] = {
      multisteplr: { milestones: s.milestones },
    };
  }
  if (s.patchMask !== undefined) {
    training['patch_mask'] = {
      init_epoch: s.patchMask.initEpoch,
      final_epoch: s.patchMask.finalEpoch,
    };
  }
  const patch: Config = { training };
  if (s.annealFreezeUntilEpoch !== undefined) {
    patch['callbacks'] = {
      anneal_weight: { freeze_until_epoch: s.annealFreezeUntilEpoch },
    };
  }
  return patch;
}

/** One line under the Epochs field, e.g. "Backbone unfreezes at epoch 7. Learning rate drops at epochs 50, 67, 83." */
export function describeEpochSchedule(s: EpochSchedule): string {
  const parts: string[] = [];
  if (s.unfreezingEpoch !== undefined) {
    parts.push(`Backbone unfreezes at epoch ${s.unfreezingEpoch}.`);
  }
  if (s.milestones?.length) {
    parts.push(`Learning rate drops at epochs ${s.milestones.join(', ')}.`);
  }
  return parts.join(' ');
}

function spreadMilestones(
  target: number[],
  after: number,
  epochs: number,
): number[] {
  const n = target.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const lo = i === 0 ? after + 1 : out[i - 1] + 1;
    const hi = epochs - (n - 1 - i);
    // When epochs is too small to fit them all, `<= epochs` wins over increasing.
    out.push(Math.min(Math.max(target[i], lo), Math.max(hi, 1), epochs));
  }
  return out;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}
