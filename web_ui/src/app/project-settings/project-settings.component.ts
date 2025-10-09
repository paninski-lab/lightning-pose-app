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
import { JsonPipe } from '@angular/common';

@Component({
  selector: 'app-project-settings',
  imports: [ReactiveFormsModule, JsonPipe],
  templateUrl: './project-settings.component.html',
  styleUrl: './project-settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectSettingsComponent implements OnInit {
  done = output<null>();
  setupMode = input(false);

  protected selectedTab = signal<string>('directories');
  protected projectInfoForm: FormGroup;
  protected viewsInitialRows = signal(4);
  protected keypointInitialRows = signal(4);
  private projectInfoService = inject(ProjectInfoService);
  private fb = inject(FormBuilder);

  constructor() {
    this.projectInfoForm = this.fb.group({
      dataDir: '',
      modelDir: '',
      views: [''],
      keypointNames: [''],
    });
  }

  ngOnInit() {
    const projectInfo = this.projectInfoService.projectInfo;
    if (projectInfo) {
      this.projectInfoForm.patchValue({
        dataDir: projectInfo.data_dir,
        modelDir: projectInfo.model_dir,
        views: projectInfo.views.join('\n'),
        keypointNames: projectInfo.keypoint_names.join('\n'),
      });
      this.projectInfoForm.markAsPristine();

      this.viewsInitialRows.update((x) =>
        Math.max(x, projectInfo.views.length),
      );

      this.keypointInitialRows.update((x) =>
        Math.max(x, projectInfo.keypoint_names.length),
      );
    }
  }

  protected async onSaveClick() {
    this.saveSuccessMessage.set('');
    if (this.saveSuccessMessageClearTimerId) {
      clearInterval(this.saveSuccessMessageClearTimerId);
      this.saveSuccessMessageClearTimerId = 0;
    }

    // Save the project info.
    const projectInfo = {} as Partial<ProjectInfo>;
    if (this.projectInfoForm.get('dataDir')?.dirty) {
      projectInfo.data_dir = this.projectInfoForm.get('dataDir')?.value ?? '';
    }

    if (this.projectInfoForm.get('modelDir')?.dirty) {
      projectInfo.model_dir = this.projectInfoForm.get('modelDir')?.value ?? '';
    }

    if (this.projectInfoForm.get('views')?.dirty) {
      projectInfo.views = this.parseTextAsList(
        this.projectInfoForm.get('views')?.value ?? '',
      );
    }

    if (this.projectInfoForm.get('keypointNames')?.dirty) {
      projectInfo.keypoint_names = this.parseTextAsList(
        this.projectInfoForm.get('keypointNames')?.value ?? '',
      );
    }
    await this.projectInfoService.setProjectInfo(projectInfo);
    // If successful reload the app because project info is global state.
    this.saveSuccessMessage.set(
      'Saved. Refresh the page for changes to take effect.',
    );
    // @ts-ignore
    this.saveSuccessMessageClearTimerId = setTimeout(() => {
      this.saveSuccessMessage.set('');
      this.saveSuccessMessageClearTimerId = 0;
    }, 5000) as number;
  }

  protected parseTextAsList(text: string): string[] {
    return text
      .replace(/[^\w\-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  protected readonly cameraViewPlaceholder = `view1
view2
...`;
  protected saveSuccessMessage = signal<string>('');
  private saveSuccessMessageClearTimerId = 0;

  protected handleTabClick(tabKey: string) {
    this.selectedTab.set(tabKey);
  }

  handleCloseClick() {}
}
