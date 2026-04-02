import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
  viewChild,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectInfoService } from '../../project-info.service';
import { ToastService } from '../../toast.service';

@Component({
  selector: 'app-edit-project-paths-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './edit-project-paths-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditProjectPathsDialogComponent implements OnInit {
  projectKey = input.required<string>();
  initialDataDir = input.required<string>();
  initialModelDir = input<string | null>();
  done = output<boolean>();

  dlg = viewChild.required<HTMLDialogElement>('dlg');

  protected dataDir = signal('');
  protected modelDir = signal('');

  private projectInfoService = inject(ProjectInfoService);
  private toastService = inject(ToastService);

  ngOnInit() {
    this.dataDir.set(this.initialDataDir());
    this.modelDir.set(this.initialModelDir() ?? '');
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
    try {
      await this.projectInfoService.updateProjectConfig({
        projectKey: this.projectKey(),
        projectInfo: {
          data_dir: this.dataDir(),
          model_dir: this.modelDir(),
        },
      });
      this.toastService.showToast({
        content: `Successfully updated paths for project "${this.projectKey()}"`,
        variant: 'success',
      });
      // Refresh projects list to show updated paths on home page
      await this.projectInfoService.fetchProjects();
      this.done.emit(true);
    } catch (error) {
      console.error('Failed to update project paths:', error);
      this.toastService.showToast({
        content: `Failed to update project paths: ${error}`,
        variant: 'error',
      });
    }
  }
}
