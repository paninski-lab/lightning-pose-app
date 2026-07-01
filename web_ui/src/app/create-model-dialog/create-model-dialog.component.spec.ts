import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import CreateModelDialogComponent from './create-model-dialog.component';
import { ProjectInfoService } from '../project-info.service';
import { SessionService } from '../session.service';
import { CameraCalibrationService } from '../camera-calibration.service';
import { ToastService } from '../toast.service';

function makeProjectInfoMock(views: string[]) {
  return {
    projectInfo: {
      views,
      data_dir: '/data',
      model_dir: '/models',
      keypoint_names: ['nose', 'tail'],
    },
    globalContext: () => null,
  };
}

function makeSessionServiceMock() {
  const mock = jasmine.createSpyObj('SessionService', [
    'getYamlFile',
    'getDefaultYamlFile',
    'getDefaultMultiviewYamlFile',
    'createTrainingTask',
  ]);
  mock.getYamlFile.and.returnValue(Promise.resolve(null));
  mock.getDefaultYamlFile.and.returnValue(Promise.resolve({}));
  mock.getDefaultMultiviewYamlFile.and.returnValue(Promise.resolve({}));
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
): Promise<ComponentFixture<CreateModelDialogComponent>> {
  await TestBed.configureTestingModule({
    imports: [CreateModelDialogComponent],
    providers: [
      { provide: ProjectInfoService, useValue: makeProjectInfoMock(views) },
      { provide: SessionService, useValue: makeSessionServiceMock() },
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
