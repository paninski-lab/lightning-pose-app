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
  // When in setupMode, the caller must provide the project key to create.
  projectKey = input<string | null>(null);

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
      useDefaultModelDir: [true],
      views: [''],
      keypointNames: [''],
    });

    this.projectInfoForm
      .get('useDefaultModelDir')
      ?.valueChanges.subscribe((useDefault) => {
        const modelDirControl = this.projectInfoForm.get('modelDir');
        if (useDefault) {
          modelDirControl?.disable();
          modelDirControl?.setValue(
            this.getDefaultModelDir(this.projectInfoForm.get('dataDir')?.value),
          );
        } else {
          modelDirControl?.enable();
        }
      });

    this.projectInfoForm.get('dataDir')?.valueChanges.subscribe((dataDir) => {
      if (this.projectInfoForm.get('useDefaultModelDir')?.value) {
        this.projectInfoForm
          .get('modelDir')
          ?.setValue(this.getDefaultModelDir(dataDir));
      }
    });
  }

  ngOnInit() {
    const projectInfo = this.projectInfoService.projectInfo;
    if (projectInfo) {
      const isDefault =
        !projectInfo.model_dir ||
        projectInfo.model_dir === this.getDefaultModelDir(projectInfo.data_dir);

      this.projectInfoForm.patchValue({
        dataDir: projectInfo.data_dir,
        views: projectInfo.views.join('\n'),
        keypointNames: projectInfo.keypoint_names.join('\n'),
        useDefaultModelDir: isDefault,
      });

      if (!isDefault) {
        this.projectInfoForm.patchValue({
          modelDir: projectInfo.model_dir,
        });
      }

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

    const useDefaultModelDir = this.projectInfoForm.get('useDefaultModelDir')?.value;

    if (this.setupMode()) {
      // Creation mode: send full object via CreateNewProject
      const key = this.projectKey();
      if (!key) {
        throw new Error('projectKey is required in setup mode');
      }
      const dataDir: string = this.projectInfoForm.get('dataDir')?.value ?? '';
      const modelDir: string | null = useDefaultModelDir
        ? null
        : this.projectInfoForm.get('modelDir')?.value ?? null;

      const projectInfo: Partial<ProjectInfo> = {
        // data_dir in projectInfo is ignored by backend YAML writer, so omit
        views: this.parseTextAsList(
          this.projectInfoForm.get('views')?.value ?? '',
        ),
        keypoint_names: this.parseTextAsList(
          this.projectInfoForm.get('keypointNames')?.value ?? '',
        ),
      };

      await this.projectInfoService.createNewProject({
        projectKey: key,
        data_dir: dataDir,
        model_dir: modelDir ?? undefined,
        projectInfo,
      });
    } else {
      // Edit mode: patch semantics via UpdateProjectConfig
      const projectInfo = {} as Partial<ProjectInfo>;
      if (this.projectInfoForm.get('dataDir')?.dirty) {
        projectInfo.data_dir = this.projectInfoForm.get('dataDir')?.value ?? '';
      }

      if (!useDefaultModelDir) {
        if (this.projectInfoForm.get('modelDir')?.dirty) {
          projectInfo.model_dir = this.projectInfoForm.get('modelDir')?.value ?? '';
        }
      } else if (this.projectInfoForm.get('useDefaultModelDir')?.dirty) {
        // If toggled back to default, set model_dir to default derived path
        const d: string = this.projectInfoForm.get('dataDir')?.value ?? '';
        projectInfo.model_dir = this.getDefaultModelDir(d);
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

      const projectKey = this.projectInfoService['getProjectKeyOrThrow']
        ? (this.projectInfoService as any)['getProjectKeyOrThrow']()
        : null;
      const key = projectKey ?? this.projectInfoService.projectContext()?.key;
      if (!key) {
        throw new Error('Project key is not available for update');
      }
      await this.projectInfoService.updateProjectConfig({
        projectKey: key,
        projectInfo,
      });
    }
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

  protected getDefaultModelDir(dataDir: string): string {
    return dataDir ? `${dataDir.replace(/\/$/, '')}/models` : '';
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
