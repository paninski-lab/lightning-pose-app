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
import { SessionService } from '../../session.service';
import { ToastService } from '../../toast.service';

@Component({
  selector: 'app-model-delete-dialog',
  imports: [FormsModule],
  templateUrl: './model-delete-dialog.component.html',
  styleUrl: './model-delete-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelDeleteDialogComponent {
  modelRelativePath = input.required<string>();
  done = output<boolean>();

  dlg = viewChild.required<HTMLDialogElement>('dlg');
  protected deleteConfirmation = signal(false);
  private sessionService = inject(SessionService);
  private toastService = inject(ToastService);

  protected closeDialog() {
    try {
      if (this.dlg().open) {
        this.dlg().close();
      }
    } finally {
      this.done.emit(false);
    }
  }

  protected async handleDelete() {
    await this.sessionService.deleteModel(this.modelRelativePath());
    this.toastService.showToast({
      content: 'Successfully deleted model',
    });
    this.done.emit(true);
  }
}
