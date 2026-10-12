import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../session.service';
import { ToastService } from '../../toast.service';
import {
  AlertDialogComponent,
  AlertFooterComponent,
  AlertHeaderComponent,
} from '../../components/alert-dialog/alert-dialog.component';

@Component({
  selector: 'app-model-delete-dialog',
  imports: [
    FormsModule,
    AlertDialogComponent,
    AlertHeaderComponent,
    AlertFooterComponent,
  ],
  templateUrl: './model-delete-dialog.component.html',
  styleUrl: './model-delete-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelDeleteDialogComponent {
  modelRelativePath = input.required<string>();
  done = output<boolean>();

  protected deleteConfirmation = signal('');
  private sessionService = inject(SessionService);
  private toastService = inject(ToastService);

  protected closeDialog() {
    this.done.emit(false);
  }

  protected async handleDelete() {
    if (this.deleteConfirmation() !== this.modelRelativePath()) return;
    try {
      await this.sessionService.deleteModel(
        this.modelRelativePath(),
        this.deleteConfirmation(),
      );
      this.toastService.showToast({
        content: 'Successfully deleted model',
      });
      this.done.emit(true);
    } catch (error) {
      console.error('Failed to delete model:', error);
      let detail = String(error);
      if (typeof error === 'object' && error !== null && 'error' in error) {
        const body = (error as { error?: { detail?: unknown } }).error;
        if (typeof body?.detail === 'string') {
          detail = body.detail;
        }
      }
      this.toastService.showToast({
        content: `Failed to delete model: ${detail}`,
        variant: 'error',
      });
    }
  }
}
