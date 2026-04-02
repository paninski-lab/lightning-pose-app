import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProjectInfoService } from '../../project-info.service';
import { ToastService } from '../../toast.service';

@Component({
  selector: 'app-edit-project-paths-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './edit-project-paths-dialog.component.html',
  styleUrl: './edit-project-paths-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditProjectPathsDialogComponent implements OnInit {
  projectKey = input.required<string>();
  dataDir = input.required<string>();
  modelDir = input<string | null>(null);
  done = output<boolean>();

  dlg = viewChild.required<HTMLDialogElement>('dlg');
  protected saving = signal(false);

  private fb = inject(FormBuilder);
  private projectInfoService = inject(ProjectInfoService);
  private toastService = inject(ToastService);

  protected form = this.fb.group({
    data_dir: ['', Validators.required],
    model_dir: [''],
  });

  ngOnInit() {
    this.form.patchValue({
      data_dir: this.dataDir(),
      model_dir: this.modelDir() ?? '',
    });
  }

  protected closeDialog() {
    try {
      if (this.dlg().open) {
        this.dlg().close();
      }
    } finally {
      this.done.emit(false);
    }
  }

  protected async handleSave() {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const { data_dir, model_dir } = this.form.value;
      await this.projectInfoService.updateProjectConfig({
        projectKey: this.projectKey(),
        projectInfo: {
          data_dir: data_dir!,
          model_dir: model_dir || '',
        },
      });
      await this.projectInfoService.fetchProjects();
      this.toastService.showToast({
        content: 'Successfully updated project paths',
        variant: 'success',
      });
      this.done.emit(true);
    } catch (error) {
      console.error('Failed to update project paths:', error);
      this.toastService.showToast({
        content: `Failed to update project paths: ${error}`,
        variant: 'error',
      });
      this.saving.set(false);
    }
  }
}
