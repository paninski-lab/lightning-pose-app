import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  output,
} from '@angular/core';
import { Router } from '@angular/router';
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
  selector: 'app-add-existing-project-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    AlertDialogComponent,
    AlertHeaderComponent,
    AlertFooterComponent,
    ModelDirInputComponent,
  ],
  templateUrl: './add-existing-project-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddExistingProjectDialogComponent implements OnInit {
  done = output<boolean>();

  private fb = inject(FormBuilder);
  private projectInfoService = inject(ProjectInfoService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  protected form?: FormGroup;

  ngOnInit() {
    this.form = this.fb.group({
      projectKey: ['', Validators.required],
      dataDir: ['', Validators.required],
      modelDirInfo: [
        {
          modelDir: '',
          useDefaultModelDir: true,
        },
      ],
    });
  }

  protected closeDialog() {
    this.done.emit(false);
  }

  protected onDataDirBlur() {
    if (!this.form) return;

    const dataDir = this.form.get('dataDir')?.value;
    const projectKeyControl = this.form.get('projectKey');

    if (dataDir && projectKeyControl && !projectKeyControl.value) {
      const fragments = dataDir
        .split(/[/\\]/)
        .filter((f: string) => f.length > 0);
      if (fragments.length > 0) {
        const lastFragment = fragments[fragments.length - 1];
        projectKeyControl.setValue(lastFragment);
      }
    }
  }

  protected async handleSave() {
    if (!this.form || this.form.invalid) {
      this.form?.markAllAsTouched();
      return;
    }

    const { projectKey, dataDir, modelDirInfo } = this.form.value;
    const modelDir = modelDirInfo.useDefaultModelDir
      ? null
      : modelDirInfo.modelDir;

    try {
      await this.projectInfoService.registerExistingProject({
        projectKey,
        data_dir: dataDir,
        model_dir: modelDir,
      });
      this.toastService.showToast({
        content: 'Successfully added existing project',
        variant: 'success',
      });
      await this.router.navigate(['/project', projectKey]);
      this.done.emit(true);
    } catch (error) {
      console.error('Failed to add existing project', error);
      this.toastService.showToast({
        content: 'Failed to add existing project',
        variant: 'error',
      });
    }
  }
}
