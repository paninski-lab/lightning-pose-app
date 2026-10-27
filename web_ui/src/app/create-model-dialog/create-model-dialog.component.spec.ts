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

function makeProjectInfoMock(views: string[], keypointNames = ['nose', 'tail']) {
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
  ]);
  mock.getYamlFile.and.returnValue(Promise.resolve(null));
  mock.getDefaultYamlFile.and.returnValue(Promise.resolve(defaultConfig));
  mock.getDefaultMultiviewYamlFile.and.returnValue(Promise.resolve(defaultConfig));
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

describe('CreateModelDialogComponent', () => {
  it('should create', async () => {
    const fixture = await createComponent([]);
    expect(fixture.componentInstance).toBeTruthy();
  });
});

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

describe('CreateModelDialogComponent — learning rate override for ViT backbones', () => {
  describe('singleview project', () => {
    let component: CreateModelDialogComponent;

    beforeEach(async () => {
      component = (await createComponent(['top'])).componentInstance;
    });

    it('overrides learning_rate to 5e-5 when a vit backbone is selected', () => {
      const patch = component['computeConfigPatch']({ backbone: 'vits_dino' });
      expect(patch.training?.optimizer_params?.learning_rate).toBe(5e-5);
    });

    it('does not override learning_rate for a non-vit backbone', () => {
      const patch = component['computeConfigPatch']({ backbone: 'resnet50' });
      expect(patch.training?.optimizer_params?.learning_rate).toBeUndefined();
    });

    it('does not set learning_rate when backbone is absent', () => {
      const patch = component['computeConfigPatch']({});
      expect(patch.training?.optimizer_params?.learning_rate).toBeUndefined();
    });
  });

  describe('multiview project', () => {
    let component: CreateModelDialogComponent;

    beforeEach(async () => {
      component = (await createComponent(['top', 'bot'])).componentInstance;
    });

    it('does not override learning_rate since the multiview default already uses 5e-5', () => {
      const patch = component['computeConfigPatch']({ backbone: 'vits_dino' });
      expect(patch.training?.optimizer_params?.learning_rate).toBeUndefined();
    });
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
      expect(patch.losses?.supervised_reprojection_heatmap_mse?.log_weight).toBe(3.0);
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
          supervised_reprojection_heatmap_mse: { enabled: false, logWeight: 3.0 },
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
    const fixture = await createComponent(['top'], makeSessionServiceMock(config));
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
    const fixture = await createComponent(['top'], makeSessionServiceMock(DEFAULT_CONFIG));
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
    const hint = fixture.nativeElement.querySelector('[data-testid="epoch-schedule-hint"]');
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
      fixture.nativeElement.querySelector('[data-testid="epoch-schedule-hint"]').textContent,
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
    expect(session.countLabeledFrames).toHaveBeenCalledWith('/data/CollectedData.csv');
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

  async function previewConfig(fixture: ComponentFixture<CreateModelDialogComponent>) {
    await fixture.componentInstance.onPreviewYamlClick();
    return { config: yamlParse(fixture.componentInstance['yamlPreviewText']()) };
  }
});
