import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  Pipe,
  PipeTransform,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { backbones } from '../modelconf';
import { JsonPipe } from '@angular/common';
import { SessionService } from '../session.service';
import _ from 'lodash';

@Pipe({
  name: 'modelType',
  standalone: true,
})
export class ModelTypeLabelPipe implements PipeTransform {
  transform(modelType: ModelType): string {
    return modelTypeLabels[modelType] || modelType.toString();
  }
}
@Component({
  selector: 'app-create-model-dialog',
  imports: [FormsModule, ReactiveFormsModule, ModelTypeLabelPipe, JsonPipe],
  templateUrl: './create-model-dialog.component.html',
  styleUrl: './create-model-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateModelDialogComponent {
  done = output<void>();
  selectedTab = signal<string>('general');
  private sessionService = inject(SessionService);
  private fb = inject(NonNullableFormBuilder);
  protected form = this.fb.group({
    modelName: ['', [Validators.required, fileNameValidator]],
    modelType: [ModelType.SUP, Validators.required],
    backbone: 'resnet50',
    labelFile: 'CollectedData_*.csv',
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

  // expose to the template
  protected modelTypeOptions = Object.values(ModelType);
  protected backboneOptions = backbones;

  handleCloseClick() {
    this.done.emit();
  }

  async onCreateClick() {
    const formObject = this.form.value;
    const configObject = await this.computeYaml(formObject);
    await this.sessionService.createTrainingTask(configObject);
    return;
  }

  private async computeYaml(
    formObject: Partial<{
      modelName: string;
      modelType: ModelType;
      backbone: string;
      labelFile: string;
      videosDir: string;
      epochs: number;
      labeledBatchSize: number;
      unlabeledBatchSize: number;
    }>,
  ) {
    const configPatchObject = {};
    const patches = [];
    if (formObject.modelName) {
      patches.push({ model: { model_name: formObject.modelName } });
    }
    if (formObject.modelType) {
      patches.push({
        model: {
          model_type:
            formObject.modelType === ModelType.SUP_CTX ||
            formObject.modelType === ModelType.S_SUP_CTX
              ? 'heatmap_mhcrnn'
              : 'heatmap',
        },
      });
    }
    // TODO losses to use.
    if (formObject.backbone) {
      patches.push({ model: { backbone: formObject.backbone } });
    }
    if (formObject.labelFile) {
      // TODO expand into a list by replacing * with views in multiview case.
      patches.push({ data: { csv_file: formObject.labelFile } });
    }
    if (formObject.videosDir) {
      patches.push({ data: { video_dir: formObject.videosDir } });
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
            train: formObject.unlabeledBatchSize,
          },
          context: {
            train: formObject.unlabeledBatchSize,
          },
        },
      });
    }

    _.merge(configPatchObject, ...patches);
    return configPatchObject;
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
}

enum ModelType {
  SUP = 'SUP',
  S_SUP = 'S_SUP',
  SUP_CTX = 'SUP_CTX',
  S_SUP_CTX = 'S_SUP_CTX',
}
const modelTypeLabels: Record<ModelType, string> = {
  [ModelType.SUP]: 'Supervised',
  [ModelType.S_SUP]: 'Semi-supervised',
  [ModelType.SUP_CTX]: 'Supervised Context',
  [ModelType.S_SUP_CTX]: 'Semi-supervised Context',
};

function fileNameValidator(control: AbstractControl): ValidationErrors | null {
  const allowedChars = /^[a-zA-Z0-9][a-zA-Z0-9-._]+$/;
  if (!allowedChars.test(control.value)) {
    return { invalidFilename: true };
  }
  return null;
}
