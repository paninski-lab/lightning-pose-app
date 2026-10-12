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
          A local file is uploaded, and a server file is copied. The source
          file stays where it is.
        </p>
        <fieldset class="flex flex-col gap-2 border-0 p-0 m-0" [disabled]="busy()">
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              class="radio"
              type="radio"
              name="calibrationDestination"
              [checked]="destination() === 'project'"
              (change)="setDestination('project')"
            />
            Project file
          </label>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              class="radio"
              type="radio"
              name="calibrationDestination"
              [checked]="destination() === 'session'"
              (change)="setDestination('session')"
            />
            Session file
          </label>
        </fieldset>
        @if (destination() === 'project') {
          <p class="text-sm m-0">
            The file will be renamed to <code>calibration.toml</code>.
          </p>
        } @else {
          <p class="text-sm m-0">
            Each file keeps its name in <code>calibrations/</code>. The name
            before <code>.toml</code> is the session id.
          </p>
        }
        <app-file-source-chooser
          [buttonLabel]="destination() === 'project' ? 'Choose file' : 'Choose files'"
          accept=".toml"
          inputId="calibrationFileInput"
          chooseTestId="choose-calibration"
          checkboxTestId="calibration-server-files"
          [multiple]="destination() === 'session'"
          [disabled]="busy()"
          (localFiles)="addLocal($event)"
          (browseServer)="pickerOpen.set(true)"
        />
        @if (pickerOpen()) {
          <div class="grow min-h-0">
            <app-server-video-picker
              [extensions]="tomlExtensions"
              noun="file"
              [multiple]="destination() === 'session'"
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
          @if (overwritePath(); as path) {
            <p class="text-sm m-0">
              This will overwrite <code>{{ path }}</code>. Are you sure?
            </p>
            <div class="flex justify-end gap-2">
              <button
                class="btn btn-soft btn-info"
                type="button"
                (click)="answerOverwrite(false)"
              >
                No
              </button>
              <button
                class="btn btn-soft btn-info"
                type="button"
                (click)="answerOverwrite(true)"
              >
                Yes
              </button>
            </div>
          } @else {
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
  private leaving = false;
  private overwriteAnswer: ((yes: boolean) => void) | null = null;

  protected readonly tomlExtensions = ['.toml'];
  protected pickerOpen = signal(false);
  protected busy = signal(false);
  protected destination = signal<'project' | 'session'>('session');
  protected overwritePath = signal<string | null>(null);
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
    this.leaving = true;
    this.answerOverwrite(false);
    try {
      if (this.dlg?.nativeElement.open) this.dlg.nativeElement.close();
    } catch {
      // Ignore a dialog that is already closed.
    }
  }

  protected setDestination(next: 'project' | 'session') {
    this.destination.set(next);
    if (next !== 'project') return;
    if (this.localFiles().length > 0) {
      this.localFiles.update((files) => files.slice(0, 1));
      this.serverFiles.set([]);
      return;
    }
    this.serverFiles.update((files) => files.slice(0, 1));
  }

  protected addLocal(files: File[]) {
    if (this.destination() === 'project') {
      const file = files[0];
      this.localFiles.set(file ? [file] : []);
      this.serverFiles.set([]);
      return;
    }
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
    if (this.destination() === 'project') {
      const file = files[0];
      this.serverFiles.set(file ? [file] : []);
      this.localFiles.set([]);
      this.pickerOpen.set(false);
      return;
    }
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

  protected answerOverwrite(yes: boolean) {
    const resolve = this.overwriteAnswer;
    this.overwriteAnswer = null;
    this.overwritePath.set(null);
    resolve?.(yes);
  }

  protected close() {
    this.leaving = true;
    this.answerOverwrite(false);
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
    const queue: { name: string; local?: File; serverPath?: string }[] = [
      ...this.localFiles().map((file) => ({ name: file.name, local: file })),
      ...this.serverFiles().map((file) => ({
        name: file.name,
        serverPath: file.path,
      })),
    ];
    for (const item of queue) {
      if (this.leaving) break;
      const result = await this.copyOne(key, item);
      if (result.kind === 'failed') {
        failures.push(`${item.name}: ${result.message}`);
        continue;
      }
      if (result.kind !== 'saved') continue;
      saved += 1;
      if (result.issues.length) {
        formatProblems.push(`${item.name}: ${result.issues.join(' ')}`);
      }
    }
    this.busy.set(false);
    if (this.leaving) return;
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

  private confirmOverwrite(relativePath: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.overwritePath.set(relativePath);
      this.overwriteAnswer = resolve;
    });
  }

  private async copyOne(
    key: string,
    item: { name: string; local?: File; serverPath?: string },
  ): Promise<
    | { kind: 'saved'; issues: string[] }
    | { kind: 'skipped' }
    | { kind: 'failed'; message: string }
  > {
    try {
      const response = await this.postCalibration(key, item, false);
      return { kind: 'saved', issues: response.issues ?? [] };
    } catch (err) {
      if ((err as { status?: number }).status !== 409 || this.leaving) {
        return {
          kind: 'failed',
          message: rpcErrorMessage(err, 'Could not load file'),
        };
      }
    }
    const relative =
      this.destination() === 'project'
        ? 'calibration.toml'
        : `calibrations/${item.name}`;
    const yes = await this.confirmOverwrite(relative);
    if (!yes || this.leaving) return { kind: 'skipped' };
    try {
      const response = await this.postCalibration(key, item, true);
      return { kind: 'saved', issues: response.issues ?? [] };
    } catch (err) {
      return {
        kind: 'failed',
        message: rpcErrorMessage(err, 'Could not load file'),
      };
    }
  }

  private async postCalibration(
    key: string,
    item: { local?: File; serverPath?: string },
    overwrite: boolean,
  ): Promise<{ issues?: string[] }> {
    if (item.local) {
      const form = new FormData();
      form.append('projectKey', key);
      form.append('destination', this.destination());
      form.append('overwrite', overwrite ? 'true' : 'false');
      form.append('file', item.local, item.local.name);
      return await firstValueFrom(
        this.http.post<{ issues?: string[] }>(
          '/app/v0/rpc/importCalibrationUpload',
          form,
        ),
      );
    }
    return (await this.rpc.call('importCalibrationFile', {
      projectKey: key,
      serverPath: item.serverPath,
      destination: this.destination(),
      overwrite,
    })) as { issues?: string[] };
  }
}
