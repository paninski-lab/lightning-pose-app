import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  FormGroup,
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  backbones,
  DeepPartial,
  isUnsupervised,
  ModelConfig,
  ModelType,
  TrainingConfig,
  validMvBackbones,
  validMvModelTypes,
} from '../modelconf';
import { JsonPipe, NgTemplateOutlet } from '@angular/common';
import { SessionService } from '../session.service';
import _ from 'lodash';
import { stringify as yamlStringify } from 'yaml';
import { HighlightDirective } from '../highlight.directive';
import { ProjectInfoService } from '../project-info.service';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  fileNameValidator,
  mustBeInOptionsList,
  sumToOneValidator,
} from '../utils/validators';
import { ModelTypeLabelPipe } from '../utils/pipes';
import { DaisyFormControlDirective } from '../utils/daisy-form-control.directive';
import { LabelFilePickerComponent } from '../label-file-picker/label-file-picker.component';
import { SelectComponent } from '../components/dropdown/select.component';
import { ToastService } from '../toast.service';
import { PathDisplayComponent } from '../components/path-display/path-display.component';
import { CameraCalibrationService } from '../camera-calibration.service';
import {
  describeEpochSchedule,
  EpochSchedule,
  epochSchedulePatch,
  readEpochSchedule,
  scaleEpochSchedule,
} from './epoch-schedule';
import { lpTrainFrameCount, minFramesForPosePca } from './pose-pca';

@Component({
  selector: 'app-create-model-dialog',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    JsonPipe,
    HighlightDirective,
    DaisyFormControlDirective,
    NgTemplateOutlet,
    LabelFilePickerComponent,
    SelectComponent,
    PathDisplayComponent,
  ],
  templateUrl: './create-model-dialog.component.html',
  styleUrl: './create-model-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CreateModelDialogComponent {
  done = output<string | null>();
  // Update mode support (currently effectively always setupMode=true for creation)
  setupMode = input(true);

  selectedTab = signal<string>('general');
  yamlPreviewText = signal<string>('');
  private projectInfoService = inject(ProjectInfoService);
  private sessionService = inject(SessionService);
  private toastService = inject(ToastService);
  private cameraCalibrationService = inject(CameraCalibrationService);
  private fb = inject(NonNullableFormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private modelTypeLabelPipe = new ModelTypeLabelPipe();
  private previewAbortController: AbortController = new AbortController();
  protected readonly tabs = [
    { id: 'general', text: 'General' },
    { id: 'data', text: 'Data' },
    { id: 'training', text: 'Training' },
  ];

  protected selectedTabIndex = computed(() =>
    this.tabs.findIndex((t) => t.id === this.selectedTab()),
  );

  protected form = this.fb.group({
    general: this.fb.group({
      modelName: ['', [Validators.required, fileNameValidator]],
      // Initialize to true only for multiview projects.
      useTrueMultiviewModel: [this.isMultiviewProject()],
      modelType: [
        ModelType.SUP,
        [Validators.required, mustBeInOptionsList(() => this.modelTypeOptions)],
      ],
      backbone: [
        this.projectInfoService.projectInfo.views.length > 1
          ? 'vits_dino'
          : 'resnet50',
        [Validators.required, mustBeInOptionsList(() => this.backboneOptions)],
      ],
    }),
    data: this.fb.group({
      labelFile: [null, Validators.required],
      trainValSplit: this.fb.group(
        {
          trainProb: [
            0.95, // Initial value (must be non-zero and <= 1)
            [
              Validators.required,
              Validators.min(0.000001), // Ensures value > 0
              Validators.max(1),
            ],
          ],
          valProb: [
            0.05, // Initial value (must be non-zero and <= 1)
            [
              Validators.required,
              Validators.min(0.000001), // Ensures value > 0
              Validators.max(1),
            ],
          ],
        },
        {
          // Apply the custom validator to the entire form group
          validators: sumToOneValidator,
        },
      ),
      randomSeed: [0, [Validators.required, Validators.min(0)]],
      videosDir: 'videos',
    }),
    training: this.fb.group({
      epochs: [
        300,
        [
          Validators.required,
          Validators.min(5),
          Validators.max(1000000),
          Validators.pattern('^[0-9]+$'),
        ],
      ],
      labeledBatchSize: [
        16,
        [
          Validators.required,
          Validators.min(1),
          Validators.max(1000),
          Validators.pattern('^[0-9]+$'),
        ],
      ],
      unlabeledBatchSize: [
        32,
        [
          Validators.required,
          Validators.min(1),
          Validators.max(1000),
          Validators.pattern('^[0-9]+$'),
        ],
      ],
      augmentation: ['dlc', Validators.required],
      unsupervisedLosses: this.fb.group({
        temporal: this.fb.group({
          enabled: [true],
          logWeight: [5.0, Validators.required],
        }),
        pca_singleview: this.fb.group({
          enabled: [true],
          logWeight: [5.0, Validators.required],
        }),
      }),
      multiviewLosses: this.fb.group({
        supervised_reprojection_heatmap_mse: this.fb.group({
          enabled: [true],
          logWeight: [3.0, Validators.required],
        }),
      }),
    }),
  });

  // Protected instance fields for nested form groups
  protected generalForm: FormGroup = this.form.get('general') as FormGroup;
  protected dataForm: FormGroup = this.form.get('data') as FormGroup;
  protected trainingForm: FormGroup = this.form.get('training') as FormGroup;
  protected baseConfigPath = signal<string | null>(null);
  protected projectHasCalibrations = signal(false);
  protected useCameraCalibrations = signal(false);
  /** Epoch-counted settings of the base config; null if it counts in steps, undefined while loading. */
  protected baseEpochSchedule = signal<EpochSchedule | null | undefined>(
    undefined,
  );
  private posePcaChoice = true;
  /** Labeled frames in the chosen label file; null while unknown. */
  protected labeledFrameCount = signal<number | null>(null);

  private epochsAsSignal = toSignal(
    this.trainingForm.controls['epochs'].valueChanges.pipe(
      takeUntilDestroyed(),
    ),
    { initialValue: this.trainingForm.controls['epochs'].value as number },
  );
  private labelFileAsSignal = toSignal(
    this.dataForm.controls['labelFile'].valueChanges.pipe(takeUntilDestroyed()),
    {
      initialValue: this.dataForm.controls['labelFile'].value as string | null,
    },
  );
  private trainValSplitAsSignal = toSignal(
    this.dataForm.controls['trainValSplit'].valueChanges.pipe(
      takeUntilDestroyed(),
    ),
    {
      initialValue: this.dataForm.controls['trainValSplit'].value as {
        trainProb: number;
        valProb: number;
      },
    },
  );

  /** The schedule the chosen number of epochs gives, for the hint under Epochs. */
  protected epochScheduleHint = computed(() => {
    const base = this.baseEpochSchedule();
    const epochs = Number(this.epochsAsSignal());
    if (!base || !Number.isInteger(epochs) || epochs < 1) return '';
    return describeEpochSchedule(scaleEpochSchedule(base, epochs));
  });

  /**
   * Why Pose PCA can't be used with the chosen label file and split, or null.
   * Unknown counts (still loading, or the count failed) leave it enabled.
   */
  protected posePcaUnavailableReason = computed((): string | null => {
    const labeled = this.labeledFrameCount();
    const split = this.trainValSplitAsSignal();
    if (labeled === null || !split?.trainProb || !split?.valProb) return null;
    const numKeypoints =
      this.projectInfoService.projectInfo.keypoint_names.length;
    const { trainProb, valProb } = split;
    if (lpTrainFrameCount(labeled, trainProb, valProb) >= 2 * numKeypoints) {
      return null;
    }
    const needed = minFramesForPosePca(numKeypoints, trainProb, valProb);
    return `Pose PCA needs at least ${needed} labeled frames for ${numKeypoints} keypoints (you have ${labeled}).`;
  });

  private useTrueMultiviewModelAsSignal = toSignal(
    this.generalForm.controls['useTrueMultiviewModel'].valueChanges.pipe(
      takeUntilDestroyed(),
    ),
    { initialValue: this.generalForm.controls['useTrueMultiviewModel'].value },
  );

  // expose to the template
  protected modelTypeOptions = computed((): ModelType[] => {
    return this.useTrueMultiviewModelAsSignal()
      ? validMvModelTypes
      : Object.values(ModelType);
  });
  protected backboneOptions = computed((): string[] => {
    return this.useTrueMultiviewModelAsSignal() ? validMvBackbones : backbones;
  });
  protected modelTypeSelectOptions = computed(() =>
    this.modelTypeOptions().map((type) => ({
      label: this.modelTypeLabelPipe.transform(type),
      value: type,
    })),
  );
  protected backboneSelectOptions = computed(() =>
    this.backboneOptions().map((backbone) => ({
      label: backbone,
      value: backbone,
    })),
  );
  protected videosDirOptions = [
    { label: 'videos', value: 'videos' },
    { label: 'videos_labeled', value: 'videos_labeled' },
  ];

  protected augmentationOptions = computed(() =>
    this.useCameraCalibrations()
      ? [{ label: 'DLC', value: 'dlc' }]
      : [
          { label: 'DLC', value: 'dlc' },
          { label: 'DLC-TopDown', value: 'dlc-top-down' },
        ],
  );

  constructor() {
    const setBaseConfigToDefault = () => {
      if (this.isMultiviewProject()) {
        this.baseConfigPath.set(
          'https://github.com/paninski-lab/lightning-pose-app/blob/main/app_server/src/litpose_app/config_default_multiview.yaml',
        );
      } else {
        this.baseConfigPath.set(
          'https://github.com/paninski-lab/lightning-pose-app/blob/main/app_server/src/litpose_app/config_default.yaml',
        );
      }
    };
    this.sessionService
      .getYamlFile('configs/default.yaml')
      .then((baseConfig) => {
        if (baseConfig) {
          this.baseConfigPath.set(
            this.projectInfoService.projectInfo.data_dir +
              '/configs/default.yaml',
          );
        } else {
          setBaseConfigToDefault();
        }
      })
      .catch(() => {
        setBaseConfigToDefault();
      });
    this.loadBaseConfig()
      .then((baseConfig) => {
        const schedule = readEpochSchedule(baseConfig);
        this.baseEpochSchedule.set(schedule);
        if (schedule === null) {
          // A step-based base config: the Epochs field would not be written.
          this.trainingForm.controls['epochs'].disable();
        }
      })
      .catch(() => this.baseEpochSchedule.set(undefined));

    this.cameraCalibrationService.projectHasCalibrations().then((has) => {
      this.projectHasCalibrations.set(has);
      this.useCameraCalibrations.set(has && this.supports3dFeatures());
    });

    effect(() => {
      // Read the signal to track the dependency.
      this.useTrueMultiviewModelAsSignal();
      // On change, update the form controls validity.
      this.generalForm.controls['backbone'].updateValueAndValidity();
      this.generalForm.controls['modelType'].updateValueAndValidity();
    });
    effect(() => {
      if (this.useCameraCalibrations()) {
        this.trainingForm.controls['augmentation'].setValue('dlc');
      }
    });
    effect((onCleanup) => {
      const csvPath = this.singleviewCsvPath(this.labelFileAsSignal());
      this.labeledFrameCount.set(null);
      if (!csvPath) return;
      let stale = false;
      onCleanup(() => (stale = true));
      this.sessionService
        .countLabeledFrames(csvPath)
        .then((n) => {
          if (!stale) this.labeledFrameCount.set(n);
        })
        .catch(() => {
          // Leave Pose PCA enabled; LP reports the problem if training fails.
        });
    });
    effect(() => {
      // Pose PCA needs enough training frames; a disabled group is left out of the config.
      const pca = (this.trainingForm.get('unsupervisedLosses') as FormGroup)
        .controls['pca_singleview'];
      const enabled = pca.get('enabled')!;
      if (this.posePcaUnavailableReason()) {
        if (pca.enabled) {
          // Show it unchecked, and restore the user's choice if it becomes available.
          this.posePcaChoice = enabled.value;
          enabled.setValue(false);
          pca.disable();
        }
      } else if (pca.disabled) {
        pca.enable();
        enabled.setValue(this.posePcaChoice);
      }
    });
  }

  /** CSV path of a single-view label file key; null for multiview projects. */
  private singleviewCsvPath(labelFileKey: string | null): string | null {
    if (!labelFileKey || this.isMultiviewProject()) return null;
    const file = this.sessionService
      .allLabelFiles()
      .find((f) => f.key === labelFileKey);
    return file?.views[0]?.csvPath ?? null;
  }

  /** The project's configs/default.yaml, or LPA's bundled default when there is none. */
  private async loadBaseConfig(): Promise<Record<string, any>> {
    const baseConfig = await this.sessionService.getYamlFile(
      'configs/default.yaml',
    );
    if (baseConfig) return baseConfig;
    return this.isMultiviewProject()
      ? await this.sessionService.getDefaultMultiviewYamlFile()
      : await this.sessionService.getDefaultYamlFile();
  }

  handleCloseClick() {
    this.done.emit(null);
  }

  handleTabClick(tabId: string) {
    this.selectedTab.set(tabId);
  }

  protected handleBackClick() {
    const currentIndex = this.selectedTabIndex();
    if (currentIndex > 0) {
      this.selectedTab.set(this.tabs[currentIndex - 1].id);
    }
  }

  protected handleNextClick() {
    const currentTabId = this.selectedTab();
    let currentFormGroup: FormGroup | undefined;

    switch (currentTabId) {
      case 'general':
        currentFormGroup = this.generalForm;
        break;
      case 'data':
        currentFormGroup = this.dataForm;
        break;
      case 'training':
        currentFormGroup = this.trainingForm;
        break;
      default:
        // Unknown tab (e.g. yaml)
        return;
    }

    if (currentFormGroup && currentFormGroup.valid) {
      const currentIndex = this.selectedTabIndex();
      if (currentIndex >= 0 && currentIndex < this.tabs.length - 1) {
        this.selectedTab.set(this.tabs[currentIndex + 1].id);
      }
    } else {
      currentFormGroup?.markAllAsTouched();
      this.cdr.detectChanges();
    }
  }

  protected isGeneralFormValid(): boolean {
    return this.generalForm.valid;
  }

  protected isDataFormValid(): boolean {
    return this.dataForm.valid;
  }

  protected isTrainingFormValid(): boolean {
    return this.trainingForm.valid;
  }

  async onCreateClick() {
    const yamlText = await this.generateYamlText();
    if (!yamlText) {
      return;
    }
    const modelName: string = this.generalForm.controls['modelName'].value!;
    await this.sessionService.createTrainingTask(modelName, yamlText);

    this.toastService.showToast({
      content: 'Successfully created model training task',
      variant: 'success',
    });

    this.done.emit(modelName);
  }

  private async generateYamlText(
    abortSignal?: AbortSignal,
  ): Promise<string | null> {
    try {
      const baseConfig = await this.loadBaseConfig();
      if (abortSignal?.aborted) return null;
      // Combine values from all nested forms
      const formObject = {
        ...this.generalForm.value,
        ...this.dataForm.value,
        ...this.trainingForm.value,
      };
      const patch = this.computeConfigPatch(
        formObject,
        readEpochSchedule(baseConfig),
      );
      if (abortSignal?.aborted) return null;

      const merged = _.merge({}, baseConfig, patch);
      (merged as any).creation_datetime = new Date().toISOString();
      const yamlText = yamlStringify(merged);
      if (abortSignal?.aborted) return null;

      return yamlText;
    } catch (error) {
      if (abortSignal?.aborted) return null;

      // Let other errors bubble to global handler or console for now
      throw error;
    }
  }

  private computeConfigPatch(
    formObject: Partial<{
      modelName: string;
      useTrueMultiviewModel: boolean;
      modelType: ModelType;
      backbone: string;
      unsupervisedLosses: Partial<{
        temporal: Partial<{ enabled: boolean; logWeight: number }>;
        pca_singleview: Partial<{ enabled: boolean; logWeight: number }>;
      }>;
      labelFile: string;
      trainValSplit: Partial<{ trainProb: number; valProb: number }>;
      randomSeed: number;
      videosDir: string;
      epochs: number;
      labeledBatchSize: number;
      unlabeledBatchSize: number;
      augmentation: string;
      multiviewLosses: Partial<{
        supervised_reprojection_heatmap_mse: Partial<{
          enabled: boolean;
          logWeight: number;
        }>;
      }>;
    }>,
    baseEpochSchedule: EpochSchedule | null = null,
  ): DeepPartial<ModelConfig> {
    const configPatchObject = {} as DeepPartial<ModelConfig>;
    const patches = [] as DeepPartial<ModelConfig>[];
    patches.push({
      data: {
        data_dir: this.projectInfoService.projectInfo.data_dir,
        keypoint_names: this.projectInfoService.projectInfo.keypoint_names,
        num_keypoints:
          this.projectInfoService.projectInfo.keypoint_names.length,
      },
    });
    if (this.projectInfoService.projectInfo.views.length > 1) {
      patches.push({
        data: {
          view_names: this.projectInfoService.projectInfo.views,
        },
      });
    }
    if (formObject.modelName) {
      patches.push({ model: { model_name: formObject.modelName } });
    }
    if (formObject.modelType) {
      patches.push({
        model: {
          model_type: formObject.useTrueMultiviewModel
            ? 'heatmap_multiview_transformer'
            : formObject.modelType === ModelType.SUP_CTX ||
                formObject.modelType === ModelType.S_SUP_CTX
              ? 'heatmap_mhcrnn'
              : 'heatmap',
        },
      });
      if (isUnsupervised(formObject.modelType)) {
        const ul = formObject.unsupervisedLosses;
        patches.push({
          model: {
            losses_to_use: [
              ul?.temporal?.enabled ? 'temporal' : null,
              ul?.pca_singleview?.enabled ? 'pca_singleview' : null,
            ].filter(Boolean) as string[],
          },
        });

        if (ul?.pca_singleview?.enabled) {
          // TODO allow user to choose which columns to use for Pose PCA
          patches.push({
            data: {
              columns_for_singleview_pca: Array.from(
                {
                  length:
                    this.projectInfoService.projectInfo.keypoint_names.length,
                },
                (_, i) => i,
              ),
            },
          });
        }
      } else {
        patches.push({
          model: {
            losses_to_use: [],
          },
        });
      }
    }

    if (formObject.backbone) {
      patches.push({ model: { backbone: formObject.backbone } });
      // ViT backbones need a lower learning rate than the single-view default (1e-3).
      // Multiview projects already default to 5e-5, so only patch for single-view models.
      if (!this.isMultiviewProject() && formObject.backbone.startsWith('vit')) {
        patches.push({
          training: { optimizer_params: { learning_rate: 5e-5 } },
        });
      }
    }
    if (formObject.labelFile) {
      if (this.projectInfoService.projectInfo.views.length > 1) {
        const csvFiles = [] as string[];
        for (const view of this.projectInfoService.projectInfo.views) {
          csvFiles.push(formObject.labelFile.replace('*', view));
        }
        patches.push({ data: { csv_file: csvFiles } });
      } else {
        patches.push({ data: { csv_file: formObject.labelFile } });
      }
    }
    if (formObject.trainValSplit) {
      patches.push({
        training: {
          train_prob: formObject.trainValSplit.trainProb,
          val_prob: formObject.trainValSplit.valProb,
        },
      });
    }
    if (formObject.randomSeed) {
      patches.push({
        training: {
          rng_seed_data_pt: formObject.randomSeed,
        },
      });
    }
    if (formObject.videosDir) {
      const absVideosDir =
        this.projectInfoService.projectInfo.data_dir +
        '/' +
        formObject.videosDir;
      patches.push({
        data: {
          video_dir: absVideosDir,
        },
      });
      patches.push({
        eval: {
          test_videos_directory: absVideosDir,
        },
      });
    }
    if (formObject.epochs) {
      // Writes min/max epochs and scales the epoch-counted settings to match.
      patches.push(
        epochSchedulePatch(
          baseEpochSchedule,
          Number(formObject.epochs),
        ) as DeepPartial<ModelConfig>,
      );
    }
    if (formObject.labeledBatchSize) {
      patches.push({
        training: {
          train_batch_size: formObject.labeledBatchSize,
        },
      });
    }
    if (formObject.unlabeledBatchSize) {
      patches.push({
        dali: {
          base: {
            train: { sequence_length: formObject.unlabeledBatchSize },
          },
          context: {
            train: { batch_size: formObject.unlabeledBatchSize },
          },
        },
      });
    }

    if (formObject.augmentation) {
      patches.push({
        training: {
          imgaug: formObject.augmentation as TrainingConfig['imgaug'],
        },
      });
    }
    // imgaug_3d is a 3D augmentation that requires calibration — patch independently of imgaug
    if (this.isMultiviewProject()) {
      patches.push({ training: { imgaug_3d: this.useCameraCalibrations() } });
    }

    if (!this.isMultiviewProject()) {
      const temporal = formObject.unsupervisedLosses?.temporal;
      if (temporal?.enabled && temporal.logWeight != null) {
        patches.push({
          losses: { temporal: { log_weight: temporal.logWeight } },
        });
      }
      const pcaSingleview = formObject.unsupervisedLosses?.pca_singleview;
      if (pcaSingleview?.enabled && pcaSingleview.logWeight != null) {
        patches.push({
          losses: { pca_singleview: { log_weight: pcaSingleview.logWeight } },
        });
      }
    }
    if (this.isMultiviewProject() && this.useCameraCalibrations()) {
      const srphmse =
        formObject.multiviewLosses?.supervised_reprojection_heatmap_mse;
      if (srphmse?.enabled && srphmse.logWeight != null) {
        patches.push({
          losses: {
            supervised_reprojection_heatmap_mse: {
              log_weight: srphmse.logWeight,
            },
          },
        });
      }
    }

    _.merge(configPatchObject, ...patches);
    return configPatchObject;
  }

  async onPreviewYamlClick() {
    // Follow AbortController + promise chaining pattern
    this.previewAbortController.abort();
    this.previewAbortController = new AbortController();
    const abortSignal = this.previewAbortController.signal;

    const yamlText = await this.generateYamlText(abortSignal);
    if (abortSignal.aborted || !yamlText) {
      return;
    }
    this.yamlPreviewText.set(yamlText);
    this.handleTabClick('yaml');
  }

  formInvalidReason(): string {
    // Iterate over nested groups first
    const groups = [
      { name: 'general', group: this.generalForm },
      { name: 'data', group: this.dataForm },
      { name: 'training', group: this.trainingForm },
    ];

    for (const { name: groupName, group } of groups) {
      if (group.invalid) {
        // Check controls inside the group
        for (const [ctrlName, control] of Object.entries(group.controls)) {
          if (control.invalid) {
            return `${groupName}.${ctrlName} invalid`;
          }
        }
        return `${groupName} group invalid`;
      }
    }
    return '';
  }

  protected isMultiviewProject(): boolean {
    return this.projectInfoService.projectInfo.views.length > 1;
  }

  protected supports3dFeatures = computed(() => {
    const version =
      this.projectInfoService.globalContext()?.versions['lightning-pose'];
    if (!version) return false;
    const parts = version.split('.').map(Number);
    const [major = 0, minor = 0, patch = 0] = parts;
    return (
      major > 2 ||
      (major === 2 && minor > 1) ||
      (major === 2 && minor === 1 && patch >= 1)
    );
  });

  protected isUnsupervised = isUnsupervised;
}

export default CreateModelDialogComponent;
