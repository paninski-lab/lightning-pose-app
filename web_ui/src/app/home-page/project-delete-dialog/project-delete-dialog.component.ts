import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectInfoService } from '../../project-info.service';
import { ToastService } from '../../toast.service';
import {
  AlertDialogComponent,
  AlertFooterComponent,
  AlertHeaderComponent,
} from '../../components/alert-dialog/alert-dialog.component';

@Component({
  selector: 'app-project-delete-dialog',
  imports: [
    FormsModule,
    AlertDialogComponent,
    AlertHeaderComponent,
    AlertFooterComponent,
  ],
  templateUrl: './project-delete-dialog.component.html',
  styleUrl: './project-delete-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDeleteDialogComponent {
  projectKey = input.required<string>();
  dataDir = input.required<string>();
  modelDir = input<string>();
  done = output<boolean>();

  protected removeFiles = signal(false);
  protected deleteConfirmation = signal(false);
  private projectInfoService = inject(ProjectInfoService);
  private toastService = inject(ToastService);

  protected closeDialog() {
    this.done.emit(false);
  }

  protected async handleDelete() {
    try {
      await this.projectInfoService.deleteProject(
        this.projectKey(),
        this.removeFiles(),
      );
      this.toastService.showToast({
        content: `Successfully deleted project "${this.projectKey()}"`,
        variant: 'success',
      });
      this.done.emit(true);
    } catch (error) {
      console.error('Failed to delete project:', error);
      this.toastService.showToast({
        content: `Failed to delete project: ${error}`,
        variant: 'error',
      });
      this.done.emit(true);
    }
  }
}
