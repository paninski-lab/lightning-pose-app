import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import {
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
  validMvBackbones,
  validMvModelTypes,
} from '../modelconf';
import { JsonPipe } from '@angular/common';
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

@Component({
  selector: 'app-create-model-dialog',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ModelTypeLabelPipe,
    JsonPipe,
    HighlightDirective,
    DaisyFormControlDirective,
  ],
  templateUrl: './create-model-dialog.component.html',
  styleUrl: './create-model-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateModelDialogComponent {
  done = output<void>();
  selectedTab = signal<string>('general');
  yamlPreviewText = signal<string>('');
  private projectInfoService = inject(ProjectInfoService);
  private sessionService = inject(SessionService);
  private fb = inject(NonNullableFormBuilder);
  private previewAbortController: AbortController = new AbortController();
  checkboxOptions = ['temporal', 'pca_singleview'];
  checkboxOptionLabels = ['Temporal', 'Pose PCA'];
  protected form = this.fb.group({
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
      atLeastOneTrueValidator(),
    ),
    labelFile: 'CollectedData_*.csv',
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
  });
  private useTrueMultiviewModelAsSignal = toSignal(
    this.form.controls.useTrueMultiviewModel.valueChanges.pipe(
      takeUntilDestroyed(),
    ),
    { initialValue: this.form.controls.useTrueMultiviewModel.value },
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
      this.form.controls.backbone.updateValueAndValidity();
      this.form.controls.modelType.updateValueAndValidity();
    });
  }

  handleCloseClick() {
    this.done.emit();
  }

  async onCreateClick() {
    const yamlText = await this.generateYamlText();
    if (!yamlText) {
      return;
    }
    await this.sessionService.createTrainingTask(
      this.form.controls.modelName.value!,
      yamlText,
    );
    this.done.emit();
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
      const formObject = this.form.value;
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
      patches.push({
        data: {
          video_dir:
            this.projectInfoService.projectInfo.data_dir +
            '/' +
            formObject.videosDir,
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

  handleTabClick(tabId: string) {
    this.selectedTab.set(tabId);
  }

  formInvalidReason(): string {
    for (const [name, control] of Object.entries(this.form.controls)) {
      if (control.invalid) {
        return `${name} invalid`;
      }
    }
    return '';
  }

  protected isMultiviewProject(): boolean {
    return this.projectInfoService.projectInfo.views.length > 1;
  }

  protected isUnsupervised = isUnsupervised;
}
