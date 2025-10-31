import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { JsonPipe } from '@angular/common';
import { HighlightDirective } from '../highlight.directive';

@Component({
  selector: 'app-error-dialog',
  imports: [
    MatDialogContent,
    MatDialogTitle,
    MatDialogActions,
    MatButton,
    MatDialogClose,
    JsonPipe,
    HighlightDirective,
  ],
  templateUrl: './error-dialog.component.html',
  styleUrl: './error-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorDialogComponent {
  data = inject(MAT_DIALOG_DATA);
}
