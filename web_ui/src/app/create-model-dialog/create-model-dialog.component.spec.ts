import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import CreateModelDialogComponent from './create-model-dialog.component';
import { ProjectInfoService } from '../project-info.service';
import { SessionService } from '../session.service';
import { CameraCalibrationService } from '../camera-calibration.service';
import { ToastService } from '../toast.service';
import { ModelType } from '../modelconf';
import { parse as yamlParse } from 'yaml';

function makeProjectInfoMock(
  views: string[],
  keypointNames = ['nose', 'tail'],
) {
  return {
    projectInfo: {
      views,
      data_dir: '/data',
      model_dir: '/models',
      keypoint_names: keypointNames,
    },
    globalContext: () => null,
  };
}

/** The epoch-counted part of LPA's config_default.yaml. */
const DEFAULT_CONFIG = {
  training: {
    unfreezing_epoch: 20,
    min_epochs: 300,
    max_epochs: 300,
    lr_scheduler: 'multisteplr',
    lr_scheduler_params: { multisteplr: { milestones: [150, 200, 250] } },
  },
};

function makeSessionServiceMock(defaultConfig: object = {}) {
  const mock = jasmine.createSpyObj('SessionService', [
    'getYamlFile',
    'getDefaultYamlFile',
    'getDefaultMultiviewYamlFile',
    'createTrainingTask',
    'countLabeledFrames',
    'allLabelFiles',
    'writeDefaultModelConfig',
    'recommendModelConfig',
  ]);
  mock.getYamlFile.and.returnValue(Promise.resolve(null));
  mock.getDefaultYamlFile.and.returnValue(Promise.resolve(defaultConfig));
  mock.getDefaultMultiviewYamlFile.and.returnValue(
    Promise.resolve(defaultConfig),
  );
  mock.countLabeledFrames.and.returnValue(Promise.resolve(100));
  mock.allLabelFiles.and.returnValue([
    {
      key: 'CollectedData.csv',
      views: [{ viewName: 'unknown', csvPath: '/data/CollectedData.csv' }],
    },
  ]);
  return mock;
}

function makeCameraCalibrationServiceMock() {
  const mock = jasmine.createSpyObj('CameraCalibrationService', [
    'projectHasCalibrations',
    'getCalibrationStatus',
  ]);
  mock.projectHasCalibrations.and.returnValue(Promise.resolve(false));
  return mock;
}

async function createComponent(
  views: string[],
  sessionService = makeSessionServiceMock(),
  keypointNames?: string[],
): Promise<ComponentFixture<CreateModelDialogComponent>> {
  await TestBed.configureTestingModule({
    imports: [CreateModelDialogComponent],
    providers: [
      {
        provide: ProjectInfoService,
        useValue: makeProjectInfoMock(views, keypointNames),
      },
      { provide: SessionService, useValue: sessionService },
      {
        provide: CameraCalibrationService,
        useValue: makeCameraCalibrationServiceMock(),
      },
      {
        provide: ToastService,
        useValue: jasmine.createSpyObj('ToastService', ['showToast']),
      },
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(CreateModelDialogComponent);
  fixture.detectChanges();
  return fixture;
}

/** The config the dialog would write, as shown in the YAML preview. */
async function previewConfig(
  fixture: ComponentFixture<CreateModelDialogComponent>,
): Promise<any> {
  await fixture.componentInstance.onPreviewYamlClick();
  return yamlParse(fixture.componentInstance['yamlPreviewText']());
}

const MULTIVIEW_LOSSES_ON = {
  multiviewLosses: {
    supervised_reprojection_heatmap_mse: { enabled: true, logWeight: 3.0 },
  },
};

describe('CreateModelDialogComponent — imgaug_3d in config patch', () => {
  describe('multiview project', () => {
    let component: CreateModelDialogComponent;

    beforeEach(async () => {
      component = (await createComponent(['top', 'bot'])).componentInstance;
    });

    it('sets imgaug_3d to true when calibrations are on', () => {
      component['useCameraCalibrations'].set(true);
      const patch = component['computeConfigPatch']({ augmentation: 'dlc' });
      expect(patch.training?.imgaug_3d).toBe(true);
    });

    it('sets imgaug_3d to false when calibrations are off', () => {
      component['useCameraCalibrations'].set(false);
      const patch = component['computeConfigPatch']({ augmentation: 'dlc' });
      expect(patch.training?.imgaug_3d).toBe(false);
    });

    it('sets imgaug_3d even when augmentation is absent from formObject', () => {
      component['useCameraCalibrations'].set(true);
      const patch = component['computeConfigPatch']({});
      expect(patch.training?.imgaug_3d).toBe(true);
    });
  });

  describe('singleview project', () => {
    let component: CreateModelDialogComponent;

    beforeEach(async () => {
      component = (await createComponent(['top'])).componentInstance;
    });

    it('does not set imgaug_3d', () => {
      const patch = component['computeConfigPatch']({ augmentation: 'dlc' });
      expect(patch.training?.imgaug_3d).toBeUndefined();
    });
  });
});

describe('CreateModelDialogComponent — learning rate', () => {
  const BASE = { training: { optimizer_params: { learning_rate: 1e-3 } } };

  async function open(views: string[], base: object = BASE) {
    const fixture = await createComponent(views, makeSessionServiceMock(base));
    await fixture.whenStable();
    return { fixture, component: fixture.componentInstance };
  }

  function lr(component: CreateModelDialogComponent): number {
    return component['trainingForm'].controls['learningRate'].value;
  }

  it('single-view: a ViT backbone starts at 5e-5, others at the base config rate', async () => {
    const { fixture, component } = await open(['top']);
    const backbone = component['generalForm'].controls['backbone'];
    backbone.setValue('vits_dino');
    expect(lr(component)).toBe(5e-5);
    expect(
      (await previewConfig(fixture)).training.optimizer_params.learning_rate,
    ).toBe(5e-5);
    backbone.setValue('resnet50');
    expect(lr(component)).toBe(1e-3);
  });

  it('keeps a typed learning rate when the backbone changes', async () => {
    const { component } = await open(['top']);
    component['trainingForm'].controls['learningRate'].setValue(2e-4);
    component['markLearningRateEdited']();
    component['generalForm'].controls['backbone'].setValue('vits_dino');
    expect(lr(component)).toBe(2e-4);
  });

  it('multiview: uses the base config rate for every backbone', async () => {
    const { component } = await open(['top', 'bot'], {
      training: { optimizer_params: { learning_rate: 5e-5 } },
    });
    expect(lr(component)).toBe(5e-5);
    component['generalForm'].controls['backbone'].setValue('vits_dino');
    expect(lr(component)).toBe(5e-5);
  });
});

describe('CreateModelDialogComponent — training options (#190)', () => {
  const BASE = {
    data: { image_resize_dims: { height: 384, width: 256 } },
    model: { heatmap_loss_type: 'kl' },
    training: {
      optimizer: 'AdamW',
      optimizer_params: { learning_rate: 1e-3 },
      early_stopping: false,
      early_stop_patience: 3,
      imgaug_hflip: false,
      rng_seed_model_pt: 7,
    },
  };

  async function open(views: string[], keypoints?: string[]) {
    const fixture = await createComponent(
      views,
      makeSessionServiceMock(BASE),
      keypoints,
    );
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.handleTabClick('training');
    fixture.detectChanges();
    return { fixture, component };
  }

  function input(
    fixture: ComponentFixture<CreateModelDialogComponent>,
    label: string,
  ) {
    return fixture.nativeElement.querySelector(
      `[aria-label="${label}"]`,
    ) as HTMLInputElement | null;
  }

  it('starts each new field from the base config', async () => {
    const { component } = await open(['top']);
    const t = component['trainingForm'].controls;
    expect(t['imageHeight'].value).toBe(384);
    expect(t['imageWidth'].value).toBe(256);
    expect(t['optimizer'].value).toBe('AdamW');
    expect(t['heatmapLossType'].value).toBe('kl');
    expect(component['dataForm'].controls['modelSeed'].value).toBe(7);
  });

  it('writes image size, optimizer, heatmap loss, early stopping and model seed', async () => {
    const { fixture, component } = await open(['top']);
    const t = component['trainingForm'].controls;
    t['imageHeight'].setValue(128);
    t['imageWidth'].setValue(512);
    t['optimizer'].setValue('Adam');
    t['heatmapLossType'].setValue('js');
    t['earlyStopping'].setValue(true);
    t['earlyStopPatience'].setValue(5);
    component['dataForm'].controls['modelSeed'].setValue(3);
    const config = await previewConfig(fixture);
    expect(config.data.image_resize_dims).toEqual({ height: 128, width: 512 });
    expect(config.training.optimizer).toBe('Adam');
    expect(config.model.heatmap_loss_type).toBe('js');
    expect(config.training.early_stopping).toBeTrue();
    expect(config.training.early_stop_patience).toBe(5);
    expect(config.training.rng_seed_model_pt).toBe(3);
  });

  it('refuses an image size that is not a multiple of 128', async () => {
    const { fixture, component } = await open(['top']);
    component['trainingForm'].controls['imageHeight'].setValue(200);
    fixture.detectChanges();
    expect(component['trainingForm'].valid).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('multiples of 128');
  });

  it('offers DLC-LR augmentation', async () => {
    const { component } = await open(['top']);
    expect(
      component['augmentationOptions']().map((o: { value: string }) => o.value),
    ).toContain('dlc-lr');
  });

  it('single-view: horizontal flip writes imgaug_hflip', async () => {
    const { fixture, component } = await open(['top']);
    expect(input(fixture, 'Horizontal flip')!.disabled).toBeFalse();
    component['trainingForm'].controls['hflip'].setValue(true);
    expect((await previewConfig(fixture)).training.imgaug_hflip).toBeTrue();
  });

  it('turns horizontal flip off, saying why, when a _left keypoint has no _right', async () => {
    const { fixture } = await open(
      ['top'],
      ['nose', 'paw_left', 'ear_left', 'ear_right'],
    );
    const box = input(fixture, 'Horizontal flip')!;
    expect(box.disabled).toBeTrue();
    expect(box.closest('[data-tip]')!.getAttribute('data-tip')).toContain(
      'paw_left',
    );
  });

  it('multiview: no horizontal flip (LP does not support it for multiview models)', async () => {
    const { fixture } = await open(['top', 'bot']);
    expect(input(fixture, 'Horizontal flip')).toBeNull();
    expect((await previewConfig(fixture)).training.imgaug_hflip).toBeFalse();
  });
});

describe('CreateModelDialogComponent — project default config (#190)', () => {
  it('without configs/default.yaml, says so and creates it on request', async () => {
    const session = makeSessionServiceMock(DEFAULT_CONFIG);
    session.writeDefaultModelConfig.and.callFake(async () => {
      session.getYamlFile.and.returnValue(Promise.resolve(DEFAULT_CONFIG));
      return '/data/configs/default.yaml';
    });
    const fixture = await createComponent(['top'], session);
    await fixture.whenStable();
    fixture.detectChanges();
    const text = () =>
      fixture.nativeElement.querySelector('[data-testid="base-config"]')
        .textContent;
    const createButton = () =>
      Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
        (b as HTMLButtonElement).textContent!.includes(
          'Create project default config',
        ),
      ) as HTMLButtonElement | undefined;
    expect(text()).toContain('no default config');

    createButton()!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(session.writeDefaultModelConfig).toHaveBeenCalledTimes(1);
    expect(text()).toContain("project's default config");
    expect(createButton()).toBeUndefined();
  });

  it('with configs/default.yaml, uses it and offers no create button', async () => {
    const session = makeSessionServiceMock(DEFAULT_CONFIG);
    session.getYamlFile.and.returnValue(Promise.resolve(DEFAULT_CONFIG));
    const fixture = await createComponent(['top'], session);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="base-config"]')
        .textContent,
    ).toContain("project's default config");
    expect(fixture.nativeElement.textContent).not.toContain(
      'Create project default config',
    );
  });
});

describe('CreateModelDialogComponent — recommended settings (#190)', () => {
  const RECOMMENDATION = {
    recommendation: {
      model_type: 'heatmap',
      backbone: 'vits_dino',
      image_resize_height: 256,
      image_resize_width: 256,
      train_batch_size: 8,
      max_epochs: 500,
      optimizer: 'AdamW',
      learning_rate: 5e-5,
      imgaug: 'dlc-top-down',
      losses_to_use: ['temporal'],
      dali_train_sequence_length: 8,
      rationale: {
        backbone: 'vits_dino is a strong default',
        max_epochs: 'few frames',
      },
    },
    gpu: { name: 'Test GPU', vram_gb: 12 },
    labeledFrames: 40,
    imageHeight: 200,
    imageWidth: 300,
  };

  async function open() {
    const session = makeSessionServiceMock(DEFAULT_CONFIG);
    session.recommendModelConfig.and.returnValue(
      Promise.resolve(RECOMMENDATION),
    );
    const fixture = await createComponent(['top'], session);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.handleTabClick('training');
    fixture.detectChanges();
    const button = () =>
      Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
        (b as HTMLButtonElement).textContent!.includes(
          'Use recommended settings',
        ),
      ) as HTMLButtonElement;
    return { fixture, component, session, button };
  }

  it('needs a label file first', async () => {
    const { button } = await open();
    expect(button().disabled).toBeTrue();
  });

  it("fills the form from LP's recommendation and lists LP's reasons", async () => {
    const { fixture, component, session, button } = await open();
    component['dataForm'].controls['labelFile'].setValue('CollectedData.csv');
    fixture.detectChanges();
    button().click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(session.recommendModelConfig).toHaveBeenCalledWith(
      jasmine.objectContaining({
        csvPaths: ['/data/CollectedData.csv'],
        viewNames: [],
      }),
    );
    const g = component['generalForm'].controls;
    const t = component['trainingForm'].controls;
    expect(g['backbone'].value).toBe('vits_dino');
    expect(g['modelType'].value).toBe(ModelType.S_SUP);
    expect(t['labeledBatchSize'].value).toBe(8);
    expect(t['unlabeledBatchSize'].value).toBe(8);
    expect(t['epochs'].value).toBe(500);
    expect(t['optimizer'].value).toBe('AdamW');
    expect(t['learningRate'].value).toBe(5e-5);
    expect(t['augmentation'].value).toBe('dlc-top-down');
    const reasons = fixture.nativeElement.querySelector(
      '[data-testid="recommendation-reasons"]',
    ).textContent;
    expect(reasons).toContain('vits_dino is a strong default');
    expect(reasons).toContain('Test GPU');
  });
});

describe('CreateModelDialogComponent — reprojection loss in config patch', () => {
  describe('multiview project', () => {
    let component: CreateModelDialogComponent;

    beforeEach(async () => {
      component = (await createComponent(['top', 'bot'])).componentInstance;
    });

    it('includes reprojection log_weight when calibrations are on and loss is enabled', () => {
      component['useCameraCalibrations'].set(true);
      const patch = component['computeConfigPatch'](MULTIVIEW_LOSSES_ON);
      expect(
        patch.losses?.supervised_reprojection_heatmap_mse?.log_weight,
      ).toBe(3.0);
    });

    it('omits reprojection log_weight when calibrations are off', () => {
      component['useCameraCalibrations'].set(false);
      const patch = component['computeConfigPatch'](MULTIVIEW_LOSSES_ON);
      expect(patch.losses?.supervised_reprojection_heatmap_mse).toBeUndefined();
    });

    it('omits reprojection log_weight when loss is disabled', () => {
      component['useCameraCalibrations'].set(true);
      const patch = component['computeConfigPatch']({
        multiviewLosses: {
          supervised_reprojection_heatmap_mse: {
            enabled: false,
            logWeight: 3.0,
          },
        },
      });
      expect(patch.losses?.supervised_reprojection_heatmap_mse).toBeUndefined();
    });
  });

  describe('singleview project', () => {
    let component: CreateModelDialogComponent;

    beforeEach(async () => {
      component = (await createComponent(['top'])).componentInstance;
    });

    it('omits reprojection log_weight regardless of loss form values', () => {
      const patch = component['computeConfigPatch'](MULTIVIEW_LOSSES_ON);
      expect(patch.losses?.supervised_reprojection_heatmap_mse).toBeUndefined();
    });
  });
});

describe('CreateModelDialogComponent — epochs scale the schedule (#172)', () => {
  async function previewFor(epochs: number, config: object = DEFAULT_CONFIG) {
    const fixture = await createComponent(
      ['top'],
      makeSessionServiceMock(config),
    );
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component['trainingForm'].controls['epochs'].setValue(epochs);
    await component.onPreviewYamlClick();
    return { fixture, config: yamlParse(component['yamlPreviewText']()) };
  }

  it('writes unfreezing epoch 7 and milestones 50, 67, 83 for 100 epochs', async () => {
    const { config } = await previewFor(100);
    expect(config.training.max_epochs).toBe(100);
    expect(config.training.min_epochs).toBe(100);
    expect(config.training.unfreezing_epoch).toBe(7);
    expect(config.training.lr_scheduler_params.multisteplr.milestones).toEqual([
      50, 67, 83,
    ]);
  });

  it('writes the same schedule as before at 300 epochs', async () => {
    const { config } = await previewFor(300);
    expect(config.training.unfreezing_epoch).toBe(20);
    expect(config.training.lr_scheduler_params.multisteplr.milestones).toEqual([
      150, 200, 250,
    ]);
  });

  it('shows the scaled schedule under Epochs as the value changes', async () => {
    const fixture = await createComponent(
      ['top'],
      makeSessionServiceMock(DEFAULT_CONFIG),
    );
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.handleTabClick('training');
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[formcontrolname="epochs"]',
    );
    input.value = '150';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const hint = fixture.nativeElement.querySelector(
      '[data-testid="epoch-schedule-hint"]',
    );
    expect(hint.textContent.trim()).toBe(
      'Backbone unfreezes at epoch 10. Learning rate drops at epochs 75, 100, 125.',
    );
  });

  it('leaves a step-based base config alone and disables Epochs', async () => {
    const steps = {
      training: {
        unfreezing_step: 100,
        min_steps: 5000,
        max_steps: 5000,
        lr_scheduler: 'multisteplr',
        lr_scheduler_params: { multisteplr: { milestone_steps: [2500] } },
      },
    };
    const { fixture, config } = await previewFor(100, steps);
    expect(config.training.max_epochs).toBeUndefined();
    expect(config.training.min_epochs).toBeUndefined();
    expect(config.training.max_steps).toBe(5000);

    fixture.componentInstance.handleTabClick('training');
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[formcontrolname="epochs"]',
    );
    expect(input.disabled).toBeTrue();
    expect(
      fixture.nativeElement.querySelector('[data-testid="epoch-schedule-hint"]')
        .textContent,
    ).toContain('counts in steps');
  });
});

describe('CreateModelDialogComponent — Pose PCA needs enough frames (#54)', () => {
  // 17 keypoints: 34 PCA dimensions, so a 95/5 split needs 35 labeled frames.
  const KEYPOINTS = Array.from({ length: 17 }, (_, i) => `kp${i}`);

  async function open(labeledFrames: number) {
    const session = makeSessionServiceMock(DEFAULT_CONFIG);
    session.countLabeledFrames.and.returnValue(Promise.resolve(labeledFrames));
    const fixture = await createComponent(['top'], session, KEYPOINTS);
    const component = fixture.componentInstance;
    component['generalForm'].controls['modelType'].setValue(ModelType.S_SUP);
    component['dataForm'].controls['labelFile'].setValue('CollectedData.csv');
    fixture.detectChanges();
    await fixture.whenStable();
    component.handleTabClick('training');
    fixture.detectChanges();
    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[aria-label="Pose PCA"]',
    );
    return { fixture, component, session, checkbox };
  }

  it('disables and unchecks Pose PCA with too few frames, and says how many are needed', async () => {
    const { fixture, session, checkbox } = await open(34);
    expect(session.countLabeledFrames).toHaveBeenCalledWith(
      '/data/CollectedData.csv',
    );
    expect(checkbox.disabled).toBeTrue();
    expect(checkbox.checked).toBeFalse();
    const tip = checkbox.closest('[data-tip]')!;
    expect(tip.getAttribute('data-tip')).toBe(
      'Pose PCA needs at least 35 labeled frames for 17 keypoints (you have 34).',
    );
    // Opens to the right: centered below, the dialog's left edge cuts it off.
    expect(tip.classList).toContain('tooltip-right');
    const { config } = await previewConfig(fixture);
    expect(config.model.losses_to_use).toEqual(['temporal']);
    expect(config.data.columns_for_singleview_pca).toBeUndefined();
  });

  it('keeps Pose PCA available with enough frames', async () => {
    const { fixture, checkbox } = await open(35);
    expect(checkbox.disabled).toBeFalse();
    expect(checkbox.checked).toBeTrue();
    expect(checkbox.closest('[data-tip]')).toBeNull();
    const { config } = await previewConfig(fixture);
    expect(config.model.losses_to_use).toEqual(['temporal', 'pca_singleview']);
  });

  it('rechecks when the train split changes, restoring the earlier choice', async () => {
    const { fixture, component, checkbox } = await open(35);
    const split = component['dataForm'].controls['trainValSplit'];
    split.setValue({ trainProb: 0.8, valProb: 0.2 });
    fixture.detectChanges();
    expect(checkbox.disabled).toBeTrue();
    split.setValue({ trainProb: 0.95, valProb: 0.05 });
    fixture.detectChanges();
    expect(checkbox.disabled).toBeFalse();
    expect(checkbox.checked).toBeTrue();
  });

  it('does not hang or block Pose PCA while a negative Train prob is typed', async () => {
    const { fixture, component, checkbox } = await open(34);
    const split = component['dataForm'].controls['trainValSplit'];
    split.setValue({ trainProb: -0.5, valProb: 0.05 });
    fixture.detectChanges();
    expect(checkbox.disabled).toBeFalse();
    expect(checkbox.closest('[data-tip]')).toBeNull();
  });

  async function previewConfig(
    fixture: ComponentFixture<CreateModelDialogComponent>,
  ) {
    await fixture.componentInstance.onPreviewYamlClick();
    return {
      config: yamlParse(fixture.componentInstance['yamlPreviewText']()),
    };
  }
});
