import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  viewChild,
} from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SessionService } from '../../session.service';
import { ToastService } from '../../toast.service';
import { fileNameValidator } from '../../utils/validators';
import {
  AlertDialogComponent,
  AlertFooterComponent,
  AlertHeaderComponent,
} from '../../components/alert-dialog/alert-dialog.component';

@Component({
  selector: 'app-model-rename-dialog',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    AlertDialogComponent,
    AlertHeaderComponent,
    AlertFooterComponent,
  ],
  templateUrl: './model-rename-dialog.component.html',
  styleUrl: './model-rename-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelRenameDialogComponent implements OnInit, AfterViewInit {
  modelRelativePath = input.required<string>();
  done = output<boolean>();

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
    this.done.emit(false);
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
