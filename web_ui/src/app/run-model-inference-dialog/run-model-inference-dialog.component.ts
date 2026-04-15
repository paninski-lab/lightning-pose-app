import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  output,
} from '@angular/core';

@Component({
  selector: 'app-run-model-inference-dialog',
  standalone: true,
  imports: [],
  templateUrl: './run-model-inference-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunModelInferenceDialogComponent {
  close = output<void>();

  @HostListener('window:keydown.escape')
  onEscape() {
    this.close.emit();
  }

  handleCloseClick() {
    this.close.emit();
  }
}
