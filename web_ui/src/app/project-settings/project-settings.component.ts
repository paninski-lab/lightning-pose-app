import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
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
export class ProjectSettingsComponent {
  done = output<null>();

  protected dataDir = new FormControl('');
  protected modelDir = new FormControl('');
  private projectInfoService = inject(ProjectInfoService);

  ngOnInit() {
    const projectInfo = this.projectInfoService.projectInfo;
    this.dataDir.setValue(projectInfo.data_dir);
    this.modelDir.setValue(projectInfo.model_dir);
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

    if (Object.keys(projectInfo).length) {
      await this.projectInfoService.setProjectInfo(projectInfo);
    }

    // If successful the service is going to reload the app because
    // project info is global state.
  }
}
