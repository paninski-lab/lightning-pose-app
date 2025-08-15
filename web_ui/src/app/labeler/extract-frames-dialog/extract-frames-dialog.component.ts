import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';

@Component({
  selector: 'app-extract-frames-dialog',
  imports: [],
  templateUrl: './extract-frames-dialog.component.html',
  styleUrl: './extract-frames-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExtractFramesDialogComponent {
  private dialogRef = inject(DialogRef);

  protected handleCloseClick() {
    this.dialogRef.close();
  }
}
