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

function folderFileName(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string })
    .webkitRelativePath;
  return relative || file.name;
}

@Component({
  selector: 'app-load-model-dialog',
  imports: [FileSourceChooserComponent, ServerVideoPickerComponent],
  template: `
    <dialog #dlg class="modal" (cancel)="$event.preventDefault(); close()">
      <div
        class="modal-box w-11/12 max-w-3xl flex flex-col gap-3"
        [class.h-[70vh]]="pickerOpen()"
      >
        <h3 class="text-xl font-bold">Load model</h3>
        <p class="text-sm m-0">
          This copies one model directory into the project model directory. A
          local folder is uploaded, and a server folder is copied. The source
          stays where it is. An existing folder is left unchanged.
        </p>
        <app-file-source-chooser
          buttonLabel="Choose folder"
          inputId="modelFolderInput"
          chooseTestId="choose-model"
          checkboxTestId="model-server-files"
          [directory]="true"
          [disabled]="busy()"
          (localFiles)="addLocal($event)"
          (browseServer)="pickerOpen.set(true)"
        />
        @if (pickerOpen()) {
          <div class="grow min-h-0">
            <app-server-video-picker
              [extensions]="[]"
              noun="folder"
              [chooseDirectory]="true"
              (chosen)="addServer($event)"
              (dismissed)="pickerOpen.set(false)"
            />
          </div>
        } @else {
          <ul class="text-sm min-h-16" aria-label="Chosen model folder">
            @if (folderName(); as name) {
              <li class="font-mono">{{ name }}</li>
            } @else {
              <li class="opacity-60">No folder chosen.</li>
            }
          </ul>
          <div class="flex justify-end gap-2">
            <button class="btn btn-soft btn-info" type="button" (click)="close()">Cancel</button>
            <button
              class="btn btn-soft btn-info"
              type="button"
              [disabled]="busy() || !folderName()"
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
export class LoadModelDialogComponent implements AfterViewInit, OnDestroy {
  done = output<boolean>();
  @ViewChild('dlg', { static: true })
  private dlg!: ElementRef<HTMLDialogElement>;

  private http = inject(HttpClient);
  private rpc = inject(RpcService);
  private projectInfo = inject(ProjectInfoService);
  private toast = inject(ToastService);
  private saved = false;

  protected pickerOpen = signal(false);
  protected busy = signal(false);
  protected localFiles = signal<File[]>([]);
  protected serverFolder = signal<ServerVideoChoice | null>(null);
  protected folderName = computed(() => {
    const server = this.serverFolder();
    if (server) return server.name;
    const first = this.localFiles()[0];
    if (!first) return '';
    const relative = folderFileName(first);
    return relative.split(/[/\\]/)[0] ?? '';
  });

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
    this.serverFolder.set(null);
    this.localFiles.set(files);
  }

  protected addServer(files: ServerVideoChoice[]) {
    this.localFiles.set([]);
    this.serverFolder.set(files[0] ?? null);
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
    const name = this.folderName();
    if (!key || this.busy() || !name) return;
    this.busy.set(true);
    try {
      const response = this.serverFolder()
        ? await this.loadServer(key)
        : await this.loadLocal(key);
      this.saved = true;
      this.toast.showToast({
        content: `Loaded model folder ${name}`,
        variant: 'success',
      });
      if (response.issues?.length) {
        this.toast.showToast({
          content: `${name}: ${response.issues.join(' ')}`,
          variant: 'error',
        });
      }
      this.close();
    } catch (err) {
      this.toast.showToast({
        content: rpcErrorMessage(err, 'Could not load model folder'),
        variant: 'error',
      });
    } finally {
      this.busy.set(false);
    }
  }

  private loadLocal(projectKey: string) {
    const form = new FormData();
    form.append('projectKey', projectKey);
    for (const file of this.localFiles()) {
      form.append('files', file, folderFileName(file));
    }
    return firstValueFrom(
      this.http.post<{ issues?: string[] }>(
        '/app/v0/rpc/importModelUpload',
        form,
      ),
    );
  }

  private loadServer(projectKey: string) {
    const folder = this.serverFolder();
    return this.rpc.call('importModelDirectory', {
      projectKey,
      serverPath: folder?.path,
    }) as Promise<{ issues?: string[] }>;
  }
}
