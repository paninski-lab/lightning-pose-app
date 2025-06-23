import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { ProjectInfoService } from '../project-info.service';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ProjectInfo } from '../project-info';

@Component({
  selector: 'app-project-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './project-settings.component.html',
  styleUrl: './project-settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectSettingsComponent implements OnInit {
  done = output<null>();
  setupMode = input(false);

  protected dataDir = new FormControl('');
  protected modelDir = new FormControl('');
  protected views = new FormControl('');
  protected viewsInitialRows = signal(4);
  private projectInfoService = inject(ProjectInfoService);

  ngOnInit() {
    const projectInfo = this.projectInfoService.projectInfo;
    if (projectInfo) {
      this.dataDir.setValue(projectInfo.data_dir);
      this.modelDir.setValue(projectInfo.model_dir);
      this.views.setValue(projectInfo.views.join('\n'));
      this.viewsInitialRows.update((x) =>
        Math.max(x, projectInfo.views.length),
      );
    }
  }

  protected async onSaveClick() {
    // Save the project info.
    const projectInfo = {} as Partial<ProjectInfo>;

    if (this.dataDir.dirty) {
      projectInfo.data_dir = this.dataDir.value ?? '';
    }
    if (this.modelDir.dirty) {
      projectInfo.model_dir = this.modelDir.value ?? '';
    }
    if (this.views.dirty) {
      projectInfo.views = this.parseMultilineText(this.views.value ?? '');
    }

    if (Object.keys(projectInfo).length) {
      await this.projectInfoService.setProjectInfo(projectInfo);
    }

    // If successful the service is going to reload the app because
    // project info is global state.
  }

  private parseMultilineText(text: string): string[] {
    return text
      .split('\n')
      .map((x) => x.trim())
      .filter((x) => Boolean(x));
  }

  protected get cameraViewPlaceholder(): string {
    return `view1
view2
...`;
  }
}
