import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  OnInit,
  output,
  signal,
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
import { PathEditableComponent } from '../components/path-editable/path-editable.component';

@Component({
  selector: 'app-add-existing-project-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    AlertDialogComponent,
    AlertHeaderComponent,
    AlertFooterComponent,
    ModelDirInputComponent,
    PathEditableComponent,
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
  protected dataDirPath = signal(
    this.projectInfoService.globalContext()?.homeDir ?? '/',
  );

  constructor() {
    let isInitial = true;
    effect(() => {
      const dataDir = this.dataDirPath();
      if (!this.form) return;
      this.form.patchValue({ dataDir }, { emitEvent: true });

      // Auto-fill project key from the last path fragment if still empty.
      const projectKeyControl = this.form.get('projectKey');
      if (
        !isInitial &&
        dataDir &&
        projectKeyControl &&
        !projectKeyControl.dirty
      ) {
        const fragments = dataDir
          .split(/[/\\]/)
          .filter((f: string) => f.length > 0);
        if (fragments.length > 0) {
          projectKeyControl.setValue(fragments[fragments.length - 1]);
        }
      }
      isInitial = false;
    });
  }

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
