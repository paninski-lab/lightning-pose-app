import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  model,
} from '@angular/core';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-label-file-picker',
  imports: [],
  templateUrl: './label-file-picker.component.html',
  styleUrl: './label-file-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LabelFilePickerComponent {
  labelFileKey = model<string | null>(null);
  sessionService = inject(SessionService);
  selectSizeClass = input<string>('select-sm');

  handleSelectLabelFile(value: string) {
    if (value === 'None') {
      this.labelFileKey.set(null);
    } else {
      this.labelFileKey.set(value);
    }
  }
}
