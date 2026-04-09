import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ProjectInfoService } from '../project-info.service';
import { ToastService } from '../toast.service';
import {
  AlertDialogComponent,
  AlertFooterComponent,
  AlertHeaderComponent,
} from '../components/alert-dialog/alert-dialog.component';
import { ModelDirInputComponent } from '../components/model-dir-input/model-dir-input.component';

@Component({
  selector: 'app-update-project-paths-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    AlertDialogComponent,
    AlertHeaderComponent,
    AlertFooterComponent,
    ModelDirInputComponent,
  ],
  templateUrl: './update-project-paths-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateProjectPathsDialogComponent implements OnInit {
  projectKey = input<string>();
  initialDataDir = input<string>();
  initialModelDir = input<string | null>();

  done = output<boolean>();

  private fb = inject(FormBuilder);
  private projectInfoService = inject(ProjectInfoService);
  private toastService = inject(ToastService);

  protected form?: FormGroup;

  ngOnInit() {
    const projectInfo = this.projectInfoService.projectContext()?.projectInfo;

    const dataDir = this.initialDataDir() ?? projectInfo?.data_dir ?? '';
    const modelDir = this.initialModelDir() ?? projectInfo?.model_dir ?? null;

    // Check if model_dir is the default one based on data_dir
    const defaultModelDir = this.getDefaultModelDir(dataDir);
    const isDefaultModelDir = !modelDir || modelDir === defaultModelDir;

    this.form = this.fb.group({
      dataDir: [dataDir, Validators.required],
      modelDirInfo: [
        {
          modelDir: modelDir || defaultModelDir,
          useDefaultModelDir: isDefaultModelDir,
        },
      ],
    });
  }

  private getDefaultModelDir(dataDir: string): string {
    return dataDir ? `${dataDir.replace(/\/$/, '')}/models` : '';
  }

  protected closeDialog() {
    this.done.emit(false);
  }

  protected async handleSave() {
    if (!this.form || this.form.invalid) {
      this.form?.markAllAsTouched();
      return;
    }

    const { dataDir, modelDirInfo } = this.form.value;
    const modelDir = modelDirInfo.useDefaultModelDir
      ? null
      : modelDirInfo.modelDir;

    try {
      await this.projectInfoService.updateProjectPaths(
        dataDir,
        modelDir,
        this.projectKey(),
      );
      this.toastService.showToast({
        content: 'Successfully updated project paths',
        variant: 'success',
      });
      this.done.emit(true);
    } catch (error) {
      console.error('Failed to update project paths', error);
      this.toastService.showToast({
        content: 'Failed to update project paths',
        variant: 'error',
      });
    }
  }
}
