import { HttpClient } from '@angular/common/http';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FileSourceChooserComponent } from '../components/file-source-chooser/file-source-chooser.component';
import {
  ServerVideoChoice,
  ServerVideoPickerComponent,
} from '../components/server-video-picker/server-video-picker.component';
import { ProjectInfoService } from '../project-info.service';
import { RpcService } from '../rpc.service';
import { ToastService } from '../toast.service';
import { rpcErrorMessage } from './file-listing';

@Component({
  selector: 'app-load-calibration-dialog',
  imports: [FileSourceChooserComponent, ServerVideoPickerComponent],
  template: `
    <dialog #dlg class="modal" (cancel)="$event.preventDefault(); close()">
      <div
        class="modal-box w-11/12 max-w-3xl flex flex-col gap-3"
        [class.h-[70vh]]="pickerOpen()"
      >
        <h3 class="text-xl font-bold">Load calibration</h3>
        <p class="text-sm m-0">
          This copies <code>.toml</code> files into
          <code>calibrations/</code>. A local file is uploaded, and a server
          file is copied. The source file stays where it is. The name before
          <code>.toml</code> is the session id. An existing file is left
          unchanged.
        </p>
        <app-file-source-chooser
          buttonLabel="Choose files"
          accept=".toml"
          inputId="calibrationFileInput"
          chooseTestId="choose-calibration"
          checkboxTestId="calibration-server-files"
          [multiple]="true"
          [disabled]="busy()"
          (localFiles)="addLocal($event)"
          (browseServer)="pickerOpen.set(true)"
        />
        @if (pickerOpen()) {
          <div class="grow min-h-0">
            <app-server-video-picker
              [extensions]="tomlExtensions"
              noun="file"
              [multiple]="true"
              (chosen)="addServer($event)"
              (dismissed)="pickerOpen.set(false)"
            />
          </div>
        } @else {
          <ul class="text-sm min-h-16" aria-label="Chosen calibration files">
            @for (name of chosenNames(); track name) {
              <li class="font-mono">{{ name }}</li>
            } @empty {
              <li class="opacity-60">No files chosen.</li>
            }
          </ul>
          <div class="flex justify-end gap-2">
            <button class="btn btn-soft btn-info" type="button" (click)="close()">Cancel</button>
            <button
              class="btn btn-soft btn-info"
              type="button"
              [disabled]="busy() || chosenNames().length === 0"
              (click)="load()"
            >
              Load
            </button>
          </div>
        }
      </div>
    </dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadCalibrationDialogComponent implements AfterViewInit, OnDestroy {
  done = output<boolean>();
  @ViewChild('dlg', { static: true })
  private dlg!: ElementRef<HTMLDialogElement>;

  private http = inject(HttpClient);
  private rpc = inject(RpcService);
  private projectInfo = inject(ProjectInfoService);
  private toast = inject(ToastService);
  private saved = false;

  protected readonly tomlExtensions = ['.toml'];
  protected pickerOpen = signal(false);
  protected busy = signal(false);
  protected localFiles = signal<File[]>([]);
  protected serverFiles = signal<ServerVideoChoice[]>([]);
  protected chosenNames = computed(() => [
    ...this.localFiles().map((file) => file.name),
    ...this.serverFiles().map((file) => file.name),
  ]);

  ngAfterViewInit(): void {
    queueMicrotask(() => {
      try {
        this.dlg?.nativeElement.showModal();
      } catch {
        // Dialog may already be open.
      }
    });
  }

  ngOnDestroy(): void {
    try {
      if (this.dlg?.nativeElement.open) this.dlg.nativeElement.close();
    } catch {
      // Ignore a dialog that is already closed.
    }
  }

  protected addLocal(files: File[]) {
    const taken = new Set(this.chosenNames());
    const next = [...this.localFiles()];
    for (const file of files) {
      if (taken.has(file.name)) continue;
      taken.add(file.name);
      next.push(file);
    }
    this.localFiles.set(next);
  }

  protected addServer(files: ServerVideoChoice[]) {
    const taken = new Set(this.chosenNames());
    const next = [...this.serverFiles()];
    for (const file of files) {
      if (taken.has(file.name)) continue;
      taken.add(file.name);
      next.push(file);
    }
    this.serverFiles.set(next);
    this.pickerOpen.set(false);
  }

  protected close() {
    try {
      if (this.dlg?.nativeElement.open) this.dlg.nativeElement.close();
    } finally {
      this.done.emit(this.saved);
    }
  }

  protected async load() {
    const key = this.projectInfo.projectContext()?.key;
    if (!key || this.busy() || this.chosenNames().length === 0) return;
    this.busy.set(true);
    const failures: string[] = [];
    const formatProblems: string[] = [];
    let saved = 0;
    for (const file of this.localFiles()) {
      const form = new FormData();
      form.append('projectKey', key);
      form.append('file', file, file.name);
      try {
        const response = await firstValueFrom(
          this.http.post<{ issues?: string[] }>(
            '/app/v0/rpc/importCalibrationUpload',
            form,
          ),
        );
        saved += 1;
        if (response.issues?.length) {
          formatProblems.push(`${file.name}: ${response.issues.join(' ')}`);
        }
      } catch (err) {
        failures.push(
          `${file.name}: ${rpcErrorMessage(err, 'Could not load file')}`,
        );
      }
    }
    for (const file of this.serverFiles()) {
      try {
        const response = (await this.rpc.call('importCalibrationFile', {
          projectKey: key,
          serverPath: file.path,
        })) as { issues?: string[] };
        saved += 1;
        if (response.issues?.length) {
          formatProblems.push(`${file.name}: ${response.issues.join(' ')}`);
        }
      } catch (err) {
        failures.push(
          `${file.name}: ${rpcErrorMessage(err, 'Could not load file')}`,
        );
      }
    }
    this.busy.set(false);
    if (saved > 0) {
      this.saved = true;
      this.toast.showToast({
        content:
          saved === 1
            ? 'Loaded 1 calibration file'
            : `Loaded ${saved} calibration files`,
        variant: 'success',
      });
    }
    if (formatProblems.length > 0) {
      this.toast.showToast({
        content: formatProblems.join(' '),
        variant: 'error',
      });
    }
    if (failures.length > 0) {
      this.toast.showToast({ content: failures.join(' '), variant: 'error' });
    }
    if (saved > 0) this.close();
  }
}
