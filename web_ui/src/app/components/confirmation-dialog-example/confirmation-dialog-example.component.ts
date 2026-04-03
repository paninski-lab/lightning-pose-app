import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-confirmation-dialog-example',
  standalone: true,
  imports: [],
  templateUrl: './confirmation-dialog-example.component.html',
  styleUrl: './confirmation-dialog-example.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationDialogExampleComponent {
  protected handleCancelClick() {}
}
