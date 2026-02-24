import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
  FormGroup,
} from '@angular/forms';
import {
  backbones,
  DeepPartial,
  isUnsupervised,
  ModelConfig,
  ModelType,
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
  atLeastOneTrueValidator,
  fileNameValidator,
  mustBeInOptionsList,
  sumToOneValidator,
} from '../utils/validators';
import { ModelTypeLabelPipe } from '../utils/pipes';
import { DaisyFormControlDirective } from '../utils/daisy-form-control.directive';
import { LabelFilePickerComponent } from '../label-file-picker/label-file-picker.component';
import { ToastService } from '../toast.service';

@Component({
  selector: 'app-create-model-dialog',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ModelTypeLabelPipe,
    JsonPipe,
    HighlightDirective,
    DaisyFormControlDirective,
    NgTemplateOutlet,
    LabelFilePickerComponent,
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
  private fb = inject(NonNullableFormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private previewAbortController: AbortController = new AbortController();
  checkboxOptions = ['temporal', 'pca_singleview'];
  checkboxOptionLabels = ['Temporal', 'Pose PCA'];

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
      losses: this.fb.array(
        this.checkboxOptions.map(() => true),
        atLeastOneTrueValidator(() =>
          isUnsupervised(
            this.generalForm?.controls['modelType']?.value as ModelType,
          ),
        ),
      ),
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
    }),
  });

  // Protected instance fields for nested form groups
  protected generalForm: FormGroup = this.form.get('general') as FormGroup;
  protected dataForm: FormGroup = this.form.get('data') as FormGroup;
  protected trainingForm: FormGroup = this.form.get('training') as FormGroup;

  private useTrueMultiviewModelAsSignal = toSignal(
    this.generalForm.controls['useTrueMultiviewModel'].valueChanges.pipe(
      takeUntilDestroyed(),
    ),
    { initialValue: this.generalForm.controls['useTrueMultiviewModel'].value },
  );

  private useModelTypeAsSignal = toSignal(
    this.generalForm.controls['modelType'].valueChanges.pipe(
      takeUntilDestroyed(),
    ),
    { initialValue: this.generalForm.controls['modelType'].value },
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

  constructor() {
    effect(() => {
      // Read the signal to track the dependency.
      this.useTrueMultiviewModelAsSignal();
      // On change, update the form controls validity.
      this.generalForm.controls['backbone'].updateValueAndValidity();
      this.generalForm.controls['modelType'].updateValueAndValidity();
    });
    effect(() => {
      // Read the signal to track the dependency.
      this.useModelTypeAsSignal();
      // On change, update the form controls validity.
      this.generalForm.controls['losses'].updateValueAndValidity();
    });
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
    const defaultPath = 'configs/default.yaml';
    try {
      let baseConfig = await this.sessionService.getYamlFile(defaultPath);
      if (abortSignal?.aborted) return null;

      if (!baseConfig) {
        if (this.isMultiviewProject()) {
          baseConfig = await this.sessionService.getDefaultMultiviewYamlFile();
        } else {
          baseConfig = await this.sessionService.getDefaultYamlFile();
        }
      }
      // Combine values from all nested forms
      const formObject = {
        ...this.generalForm.value,
        ...this.dataForm.value,
        ...this.trainingForm.value,
      };
      const patch = this.computeConfigPatch(formObject);
      if (abortSignal?.aborted) return null;

      const merged = _.merge({}, baseConfig, patch);
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
      losses: boolean[];
      labelFile: string;
      trainValSplit: Partial<{ trainProb: number; valProb: number }>;
      randomSeed: number;
      videosDir: string;
      epochs: number;
      labeledBatchSize: number;
      unlabeledBatchSize: number;
    }>,
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
        patches.push({
          model: {
            losses_to_use: this.checkboxOptions.filter((x, i) => {
              return formObject.losses?.[i] ?? false;
            }),
          },
        });

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
      patches.push({
        training: {
          min_epochs: formObject.epochs,
          max_epochs: formObject.epochs,
        },
      });
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

  protected isUnsupervised = isUnsupervised;
}

export default CreateModelDialogComponent;
