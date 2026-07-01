import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ErrorDialogComponent } from './error-dialog/error-dialog.component';

@Injectable({
  providedIn: 'root',
})
/** Opens the global error dialog, ensuring at most one instance is shown at a time. */
export class ErrorDialogService {
  private opened = false;

  constructor(private dialog: MatDialog) {}

  /** Open the error dialog with the given error; no-op if a dialog is already open. */
  openDialog(error: any): void {
    if (!this.opened) {
      this.opened = true;
      const dialogRef = this.dialog.open(ErrorDialogComponent, {
        data: error,
        maxWidth: '100%',
        disableClose: true,
        hasBackdrop: true,
      });

      dialogRef.afterClosed().subscribe(() => {
        this.opened = false;
      });
    }
  }
}
