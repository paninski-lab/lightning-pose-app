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

  protected deleteConfirmation = signal(false);
  private sessionService = inject(SessionService);
  private toastService = inject(ToastService);

  protected closeDialog() {
    this.done.emit(false);
  }

  protected async handleDelete() {
    await this.sessionService.deleteModel(this.modelRelativePath());
    this.toastService.showToast({
      content: 'Successfully deleted model',
    });
    this.done.emit(true);
  }
}
