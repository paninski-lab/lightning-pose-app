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
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
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

  protected projectInfoForm: FormGroup;
  protected viewsInitialRows = signal(4);
  private projectInfoService = inject(ProjectInfoService);
  private fb = inject(FormBuilder);

  constructor() {
    this.projectInfoForm = this.fb.group({
      dataDir: [''],
      modelDir: [''],
      views: [''],
    });
  }

  ngOnInit() {
    const projectInfo = this.projectInfoService.projectInfo;
    if (projectInfo) {
      this.projectInfoForm.patchValue({
        dataDir: projectInfo.data_dir,
        modelDir: projectInfo.model_dir,
        views: projectInfo.views.join('\n'),
      });
      this.viewsInitialRows.update((x) =>
        Math.max(x, projectInfo.views.length),
      );
    }
  }

  protected async onSaveClick() {
    // Save the project info.
    const projectInfo = {} as Partial<ProjectInfo>;

    projectInfo.data_dir = this.projectInfoForm.get('dataDir')?.value ?? '';
    projectInfo.model_dir = this.projectInfoForm.get('modelDir')?.value ?? '';
    projectInfo.views = this.parseMultilineText(
      this.projectInfoForm.get('views')?.value ?? '',
    );
    await this.projectInfoService.setProjectInfo(projectInfo);
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
