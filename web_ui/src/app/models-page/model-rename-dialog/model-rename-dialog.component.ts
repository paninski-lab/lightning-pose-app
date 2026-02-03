import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SessionService } from '../../session.service';
import { ToastService } from '../../toast.service';
import { fileNameValidator } from '../../utils/validators';

@Component({
  selector: 'app-model-rename-dialog',
  imports: [FormsModule, ReactiveFormsModule],
  templateUrl: './model-rename-dialog.component.html',
  styleUrl: './model-rename-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelRenameDialogComponent {
  modelRelativePath = input.required<string>();
  done = output<boolean>();

  dlg = viewChild.required<HTMLDialogElement>('dlg');
  protected newModelName = new FormControl('', fileNameValidator);
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

  protected async handleRename() {
    await this.sessionService.renameModel(
      this.modelRelativePath(),
      this.newModelName.value!,
    );
    this.toastService.showToast({
      content: 'Successfully deleted model',
    });
    this.done.emit(true);
  }
}
