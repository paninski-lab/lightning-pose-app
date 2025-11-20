import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpEvent, HttpEventType } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-session-import',
  imports: [CommonModule, FormsModule],
  templateUrl: './session-import.component.html',
  styleUrl: './session-import.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SessionImportComponent implements AfterViewInit, OnDestroy {
  done = output<void>();
  @ViewChild('dlg', { static: true }) private dlg!: ElementRef<HTMLDialogElement>;

  // Local state
  protected selectedFiles = signal<File[]>([]);
  protected uploading = signal<boolean>(false);
  private subs: Subscription[] = [];
  private sessionService = inject(SessionService);

  protected items = computed(() =>
    this.selectedFiles().map((file) => this.toItem(file)),
  );

  protected allValid = computed(
    () => this.items().length > 0 && this.items().every((i) => i.valid),
  );

  protected addFiles(files: FileList | null) {
    if (!files) return;
    const current = this.selectedFiles();
    const next: File[] = [...current];
    for (let i = 0; i < files.length; i++) {
      next.push(files.item(i)!);
    }
    this.selectedFiles.set(next);
  }

  protected removeAt(idx: number) {
    const next = [...this.selectedFiles()];
    next.splice(idx, 1);
    this.selectedFiles.set(next);
  }

  protected clearAll() {
    this.selectedFiles.set([]);
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

  // UI helpers
  protected formatBytes(n: number): string {
    if (!Number.isFinite(n) || n < 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let idx = 0;
    let val = n;
    while (val >= 1024 && idx < units.length - 1) {
      val /= 1024;
      idx++;
    }
    return `${val.toFixed(val < 10 && idx > 0 ? 1 : 0)} ${units[idx]}`;
  }

  // Parsing and validation
  private toItem(file: File): ParsedItem {
    const { baseName, ext } = splitExtension(file.name);
    const allowedChars = /^[a-zA-Z0-9-_]+$/;

    let error: string | null = null;
    let sessionKey: string | null = null;
    let view: string | null = null;

    if (!baseName || !ext) {
      error = 'Filename must include an extension';
    } else if (!allowedChars.test(baseName)) {
      error = 'Filename contains invalid characters';
    } else if (baseName.indexOf('_') === -1) {
      error = 'Filename must be of the form session_view.ext';
    } else {
      const lastUnderscore = baseName.lastIndexOf('_');
      sessionKey = baseName.substring(0, lastUnderscore);
      view = baseName.substring(lastUnderscore + 1);
      if (!sessionKey) {
        error = 'Missing session name before underscore';
      } else if (!view) {
        error = 'Missing view name after underscore';
      } else if (view.includes('_')) {
        error = 'View name must not contain underscore';
      }
    }

    return {
      file,
      size: file.size,
      name: file.name,
      ext: ext ?? '',
      sessionKey,
      view,
      error,
      valid: error === null,
      upload: this.uploadStateFor(file.name),
    };
  }

  private uploadStates = signal<Record<string, UploadState>>({});

  private setUploadState(name: string, state: UploadState) {
    const next = { ...this.uploadStates() };
    next[name] = state;
    this.uploadStates.set(next);
  }

  private uploadStateFor(name: string): UploadState | null {
    return this.uploadStates()[name] ?? null;
  }

  protected startUploads() {
    const validItems = this.items().filter((i) => i.valid);
    if (validItems.length === 0) return;
    this.uploading.set(true);

    let completed = 0;
    const markMaybeAllDone = () => {
      completed++;
      if (completed >= validItems.length) {
        this.uploading.set(false);
      }
    };

    for (const it of validItems) {
      // Initialize state
      this.setUploadState(it.name, { status: 'uploading', progress: 0, error: null });
      const sub = this.sessionService
        .uploadVideo(it.file, it.name, false)
        .subscribe({
          next: (event: HttpEvent<unknown>) => {
            if (event.type === HttpEventType.UploadProgress) {
              const total = (event.total ?? 0) > 0 ? event.total! : undefined;
              const loaded = event.loaded ?? 0;
              const pct = total ? Math.floor((loaded / total) * 100) : Math.min(99, Math.floor(loaded / (1024 * 1024)));
              this.setUploadState(it.name, {
                status: 'uploading',
                progress: Math.min(99, pct),
                error: null,
              });
            } else if (event.type === HttpEventType.Response) {
              this.setUploadState(it.name, {
                status: 'done',
                progress: 100,
                error: null,
              });
              markMaybeAllDone();
            }
          },
          error: (err) => {
            const msg = err?.error?.detail || err?.message || 'Upload failed';
            this.setUploadState(it.name, {
              status: 'error',
              progress: 0,
              error: String(msg),
            });
            markMaybeAllDone();
          },
          complete: () => {},
        });
      this.subs.push(sub);
    }
  }

  ngOnDestroy() {
    // Ensure dialog is closed if component is destroyed while open
    try {
      if (this.dlg?.nativeElement.open) {
        this.dlg.nativeElement.close();
      }
    } catch {}
    for (const s of this.subs) s.unsubscribe();
  }
}

type ParsedItem = {
  file: File;
  name: string;
  size: number;
  ext: string;
  sessionKey: string | null;
  view: string | null;
  error: string | null;
  valid: boolean;
  upload: UploadState | null;
};

function splitExtension(filename: string): { baseName: string; ext: string } {
  const idx = filename.lastIndexOf('.');
  if (idx <= 0 || idx === filename.length - 1) {
    return { baseName: filename, ext: '' };
  }
  return { baseName: filename.substring(0, idx), ext: filename.substring(idx + 1) };
}

type UploadState = {
  status: 'uploading' | 'done' | 'error';
  progress: number; // 0-100
  error: string | null;
};
