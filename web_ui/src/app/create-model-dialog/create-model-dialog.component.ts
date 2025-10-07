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
  protected modelTypeLabels = modelTypeLabels;
  protected modelTypeOptions = Object.values(ModelType);
  protected backboneOptions = backbones;

  handleCloseClick() {
    this.done.emit();
  }

  onCreateClick() {
    return;
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

interface CreateModelFormOutput {
  modelName: string;
  modelType: ModelType;
}

function fileNameValidator(control: AbstractControl): ValidationErrors | null {
  const allowedChars = /^[a-zA-Z0-9][a-zA-Z0-9-._]+$/;
  if (!allowedChars.test(control.value)) {
    return { invalidFilename: true };
  }
  return null;
}
