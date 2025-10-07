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
  imports: [FormsModule, ReactiveFormsModule, ModelTypeLabelPipe],
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
    backbone: ['resnet50'],
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
