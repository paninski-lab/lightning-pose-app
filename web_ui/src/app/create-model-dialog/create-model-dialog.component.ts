import {
  ChangeDetectionStrategy,
  Component,
  output,
  signal,
} from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { LabelFilePickerComponent } from '../label-file-picker/label-file-picker.component';
import { ViewerSessionsPanelComponent } from '../viewer/viewer-left-panel/viewer-sessions-panel.component';

@Component({
  selector: 'app-create-model-dialog',
  imports: [
    FormsModule,
    LabelFilePickerComponent,
    ViewerSessionsPanelComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './create-model-dialog.component.html',
  styleUrl: './create-model-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateModelDialogComponent {
  done = output<void>();
  selectedTab = signal<string>('general');

  handleCloseClick() {
    this.done.emit();
  }

  onCreateClick() {
    return;
  }

  handleTabClick(tabId: string) {
    this.selectedTab.set(tabId);
  }
}
