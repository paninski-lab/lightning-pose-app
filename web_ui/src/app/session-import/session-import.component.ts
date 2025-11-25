import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VideoFileTableComponent } from '../video-import/video-file-table/video-file-table.component';
import { VideoImportStore } from '../video-import/video-import.store';

@Component({
  selector: 'app-session-import',
  imports: [CommonModule, FormsModule, VideoFileTableComponent],
  templateUrl: './session-import.component.html',
  styleUrl: './session-import.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [VideoImportStore],
})
export class SessionImportComponent implements AfterViewInit, OnDestroy {
  done = output<void>();
  @ViewChild('dlg', { static: true })
  private dlg!: ElementRef<HTMLDialogElement>;

  // Shared store for selection + upload/transcode
  private store = inject(VideoImportStore);
  protected items = this.store.items;
  protected uploading = this.store.uploading;
  protected allValid = this.store.allValid;

  protected addFiles(files: FileList | null) {
    this.store.addFiles(files);
  }

  protected removeAt(idx: number) {
    this.store.removeAt(idx);
  }

  protected clearAll() {
    this.store.clearAll();
  }

  // Dialog lifecycle
  ngAfterViewInit(): void {
    // Ensure we call showModal after first paint
    queueMicrotask(() => {
      try {
        this.dlg?.nativeElement.showModal();
      } catch {
        // no-op: in case dialog is already open in rare scenarios
      }
    });
  }

  protected closeDialog() {
    try {
      if (this.dlg?.nativeElement.open) {
        this.dlg.nativeElement.close();
      }
    } finally {
      this.done.emit();
    }
  }

  protected startImport() {
    this.store.startImport();
  }

  ngOnDestroy() {
    // Ensure dialog is closed if component is destroyed while open
    try {
      if (this.dlg?.nativeElement.open) {
        this.dlg.nativeElement.close();
      }
    } catch {}
  }
}
