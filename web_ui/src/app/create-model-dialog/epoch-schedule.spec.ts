import {
  describeEpochSchedule,
  EpochSchedule,
  epochSchedulePatch,
  readEpochSchedule,
  scaleEpochSchedule,
} from './epoch-schedule';

/** The epoch-counted settings in LPA's config_default.yaml. */
const LPA_DEFAULT = {
  training: {
    unfreezing_epoch: 20,
    min_epochs: 300,
    max_epochs: 300,
    lr_scheduler: 'multisteplr',
    lr_scheduler_params: {
      multisteplr: { milestones: [150, 200, 250], gamma: 0.5 },
    },
  },
  callbacks: { anneal_weight: { freeze_until_epoch: 60 } },
};

function scaled(epochs: number, config: object = LPA_DEFAULT): EpochSchedule {
  return scaleEpochSchedule(readEpochSchedule(config)!, epochs);
}

function expectValidForLp(s: EpochSchedule) {
  // LP: every milestone <= max_epochs. Ours: increasing, after unfreezing.
  const m = s.milestones!;
  expect(m.every((x) => x <= s.maxEpochs)).toBeTrue();
  expect(s.unfreezingEpoch!).toBeGreaterThanOrEqual(1);
  expect(m[0]).toBeGreaterThan(s.unfreezingEpoch!);
  for (let i = 1; i < m.length; i++) expect(m[i]).toBeGreaterThan(m[i - 1]);
}

describe('scaleEpochSchedule', () => {
  it('leaves the 300-epoch defaults unchanged at 300 epochs', () => {
    expect(scaled(300)).toEqual({
      maxEpochs: 300,
      unfreezingEpoch: 20,
      milestones: [150, 200, 250],
      annealFreezeUntilEpoch: 60,
    });
  });

  it('scales by epochs / 300, as in the #172 table', () => {
    expect([150, 600, 50, 100].map((e) => scaled(e))).toEqual([
      {
        maxEpochs: 150,
        unfreezingEpoch: 10,
        milestones: [75, 100, 125],
        annealFreezeUntilEpoch: 30,
      },
      {
        maxEpochs: 600,
        unfreezingEpoch: 40,
        milestones: [300, 400, 500],
        annealFreezeUntilEpoch: 120,
      },
      {
        maxEpochs: 50,
        unfreezingEpoch: 3,
        milestones: [25, 33, 42],
        annealFreezeUntilEpoch: 10,
      },
      {
        maxEpochs: 100,
        unfreezingEpoch: 7,
        milestones: [50, 67, 83],
        annealFreezeUntilEpoch: 20,
      },
    ]);
  });

  it('gives a schedule LP accepts at the dialog minimum of 5 epochs', () => {
    const s = scaled(5);
    expect(s.unfreezingEpoch).toBe(1);
    expect(s.milestones).toEqual([3, 4, 5]);
    expectValidForLp(s);
  });

  it('keeps every epoch count from 5 to 400 valid for LP', () => {
    for (let epochs = 5; epochs <= 400; epochs++)
      expectValidForLp(scaled(epochs));
  });

  it('scales a project base config relative to its own max_epochs', () => {
    const project = {
      training: {
        unfreezing_epoch: 50,
        max_epochs: 1000,
        lr_scheduler: 'multisteplr',
        lr_scheduler_params: { multisteplr: { milestones: [400, 800] } },
        patch_mask: { init_epoch: 100, final_epoch: 1000 },
      },
    };
    expect(scaled(500, project)).toEqual({
      maxEpochs: 500,
      unfreezingEpoch: 25,
      milestones: [200, 400],
      patchMask: { initEpoch: 50, finalEpoch: 500 },
    });
  });
});

describe('readEpochSchedule', () => {
  it('is null for a step-based config', () => {
    expect(
      readEpochSchedule({
        training: { max_steps: 5000, unfreezing_step: 100 },
      }),
    ).toBeNull();
  });

  it('ignores milestones when another scheduler is chosen', () => {
    const config = {
      training: {
        max_epochs: 300,
        lr_scheduler: 'cosine',
        lr_scheduler_params: { multisteplr: { milestones: [150] } },
      },
    };
    expect(readEpochSchedule(config)).toEqual({ maxEpochs: 300 });
  });
});

describe('epochSchedulePatch', () => {
  it('writes the epochs and the scaled settings', () => {
    expect(epochSchedulePatch(readEpochSchedule(LPA_DEFAULT), 100)).toEqual({
      training: {
        min_epochs: 100,
        max_epochs: 100,
        unfreezing_epoch: 7,
        lr_scheduler_params: { multisteplr: { milestones: [50, 67, 83] } },
      },
      callbacks: { anneal_weight: { freeze_until_epoch: 20 } },
    });
  });

  it('writes nothing for a step-based base config', () => {
    expect(epochSchedulePatch(null, 100)).toEqual({});
  });
});

describe('describeEpochSchedule', () => {
  it('names the unfreezing epoch and the milestones', () => {
    expect(describeEpochSchedule(scaled(100))).toBe(
      'Backbone unfreezes at epoch 7. Learning rate drops at epochs 50, 67, 83.',
    );
  });
});
