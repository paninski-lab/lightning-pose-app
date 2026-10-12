import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CalibrationFilesPanelComponent } from './calibration-files-panel.component';
import { LabelFilesPanelComponent } from './label-files-panel.component';
import { LabeledDataPanelComponent } from './labeled-data-panel.component';
import { ModelFilesPanelComponent } from './model-files-panel.component';
import { ProjectVideosComponent } from './project-videos/project-videos.component';

@Component({
  selector: 'app-file-manager-page',
  imports: [
    LabelFilesPanelComponent,
    ProjectVideosComponent,
    LabeledDataPanelComponent,
    ModelFilesPanelComponent,
    CalibrationFilesPanelComponent,
  ],
  templateUrl: './file-manager-page.component.html',
  styles: `
    :host {
      display: block;
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileManagerPageComponent {}
