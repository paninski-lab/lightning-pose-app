import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SessionService } from '../../session.service';
import { ToastService } from '../../toast.service';
import { fileNameValidator } from '../../utils/validators';
import { A11yModule, CdkTrapFocus } from '@angular/cdk/a11y';

@Component({
  selector: 'app-model-rename-dialog',
  imports: [FormsModule, ReactiveFormsModule, A11yModule],
  templateUrl: './model-rename-dialog.component.html',
  styleUrl: './model-rename-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelRenameDialogComponent implements OnInit, AfterViewInit {
  modelRelativePath = input.required<string>();
  done = output<boolean>();

  dlg = viewChild.required<HTMLDialogElement>('dlg');
  modelNameInput = viewChild<ElementRef<HTMLInputElement>>('modelNameInput');
  protected newModelName = new FormControl('', fileNameValidator);
  private sessionService = inject(SessionService);
  private toastService = inject(ToastService);

  ngOnInit() {
    const pathSegments = this.modelRelativePath().split('/');
    this.newModelName.setValue(pathSegments.join('_'));
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.modelNameInput()?.nativeElement.focus();
    }, 100);
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

  protected async handleRename() {
    await this.sessionService.renameModel(
      this.modelRelativePath(),
      this.newModelName.value!,
    );
    this.toastService.showToast({
      content: 'Successfully renamed model',
    });
    this.done.emit(true);
  }
}
