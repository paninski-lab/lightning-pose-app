import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
// import { ActivatedRoute, Router } from '@angular/router'; // REMOVE: No longer directly routed

@Component({
  selector: 'app-project-settings',
  imports: [ReactiveFormsModule, JsonPipe],
  templateUrl: './project-settings.component.html',
  styleUrl: './project-settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectSettingsComponent implements OnInit {
  closeButtonClick = output<null>();
  doneCreation = output<string>();
  // Update inputs to be signals
  setupMode = input(false);
  // required for setupMode=false
  projectKey = input<string | null>(null);

  protected selectedTab = signal<string>('directories');
  protected projectInfoForm: FormGroup;
  protected viewsInitialRows = signal(4);
  protected keypointInitialRows = signal(4);
  private projectInfoService = inject(ProjectInfoService);
  private fb = inject(FormBuilder);

  private cdr = inject(ChangeDetectorRef);

  constructor() {
    this.projectInfoForm = this.fb.group({
      projectKey: '',
      dataDir: '',
      modelDir: [{ value: '', disabled: true }], // defaults to disabled due to useDefaultModelDir: true
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
    // Use the input properties directly
    if (!this.setupMode()) {
      if (!this.projectKey()) {
        throw new Error('Attempt to edit a project without project key');
      }
      const projectInfo = this.projectInfoService.projectInfo;
      if (projectInfo) {
        const isDefault =
          !projectInfo.model_dir ||
          projectInfo.model_dir ===
            this.getDefaultModelDir(projectInfo.data_dir);

        this.projectInfoForm.patchValue({
          projectKey: this.projectKey(),
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
  }

  protected async onSaveClick() {
    this.saveSuccessMessage.set('');
    if (this.saveSuccessMessageClearTimerId) {
      clearInterval(this.saveSuccessMessageClearTimerId);
      this.saveSuccessMessageClearTimerId = 0;
    }

    const useDefaultModelDir =
      this.projectInfoForm.get('useDefaultModelDir')?.value;
    const key = this.projectInfoForm.get('projectKey')?.value;

    if (!key) {
      throw new Error('Project key is missing!');
    }

    if (this.setupMode()) {
      // Creation mode
      const dataDir: string = this.projectInfoForm.get('dataDir')?.value ?? '';
      const modelDir: string | null = useDefaultModelDir
        ? null
        : (this.projectInfoForm.get('modelDir')?.value ?? null);

      const projectInfo: Partial<ProjectInfo> = {
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
      // Edit mode
      const projectInfo = {} as Partial<ProjectInfo>;
      if (this.projectInfoForm.get('dataDir')?.dirty) {
        projectInfo.data_dir = this.projectInfoForm.get('dataDir')?.value ?? '';
      }

      if (!useDefaultModelDir) {
        if (this.projectInfoForm.get('modelDir')?.dirty) {
          projectInfo.model_dir =
            this.projectInfoForm.get('modelDir')?.value ?? '';
        }
      } else if (this.projectInfoForm.get('useDefaultModelDir')?.dirty) {
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

      await this.projectInfoService.updateProjectConfig({
        projectKey: key,
        projectInfo,
      });
    }
    this.saveSuccessMessage.set(
      'Saved. Refresh the page for changes to take effect.',
    );
    // Emit 'done' output when saving is complete
    setTimeout(() => {
      this.saveSuccessMessage.set('');
      this.saveSuccessMessageClearTimerId = 0;
      this.doneCreation.emit(key);
    }, 1500); // Short delay for user to see save message
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
}
