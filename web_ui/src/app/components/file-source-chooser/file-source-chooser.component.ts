import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * Choose local files with the browser file input, or ask the parent to open
 * the in-app server browser. Server files starts off.
 */
@Component({
  selector: 'app-file-source-chooser',
  template: `
    <div class="flex gap-3 items-center">
      @if (useServerFiles()) {
        <button
          type="button"
          class="btn btn-primary"
          [attr.data-testid]="chooseTestId()"
          [disabled]="disabled()"
          (click)="browseServer.emit()"
        >
          {{ buttonLabel() }}
        </button>
      } @else {
        <label
          class="btn btn-primary"
          [attr.data-testid]="chooseTestId()"
          [class.btn-disabled]="disabled()"
          [attr.for]="inputId()"
          >{{ buttonLabel() }}</label
        >
      }
      <input
        [id]="inputId()"
        type="file"
        class="hidden"
        #fileInput
        [disabled]="disabled() || useServerFiles()"
        [accept]="accept()"
        [multiple]="multiple()"
        (change)="onLocal(fileInput)"
      />
      <label class="label cursor-pointer gap-2">
        <input
          type="checkbox"
          class="checkbox checkbox-sm"
          [attr.data-testid]="checkboxTestId()"
          [checked]="useServerFiles()"
          [disabled]="disabled()"
          (change)="onServerToggle($event)"
        />
        <span class="label-text">Server files</span>
      </label>
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileSourceChooserComponent {
  buttonLabel = input('Choose files');
  accept = input('');
  multiple = input(true);
  disabled = input(false);
  inputId = input('videoFileInput');
  chooseTestId = input('choose-videos');
  checkboxTestId = input('server-files-checkbox');

  localFiles = output<File[]>();
  browseServer = output<void>();
  serverModeChange = output<boolean>();

  protected useServerFiles = signal(false);

  protected onLocal(input: HTMLInputElement) {
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';
    if (files.length > 0) this.localFiles.emit(files);
  }

  protected onServerToggle(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.useServerFiles.set(checked);
    this.serverModeChange.emit(checked);
  }
}
