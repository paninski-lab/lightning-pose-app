import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { ProjectInfoService } from '../project-info.service';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ProjectInfo } from '../project-info';
import { JsonPipe, NgTemplateOutlet } from '@angular/common';

@Component({
  selector: 'app-project-settings',
  imports: [ReactiveFormsModule, JsonPipe, NgTemplateOutlet],
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
  private cdr = inject(ChangeDetectorRef); // Keep cdr for markAllAsTouched

  // Protected instance fields for nested form groups
  protected directoriesForm!: FormGroup;
  protected keypointsForm!: FormGroup;
  protected multiviewForm!: FormGroup;

  protected readonly tabs = [
    { key: 'directories', icon: 'folder', text: 'Local setup' },
    { key: 'keypoints', icon: 'adjust', text: 'Keypoints' },
    { key: 'multiview', icon: 'camera_alt', text: 'Multiview' },
  ];

  constructor() {
    this.projectInfoForm = this.fb.group({
      directories: this.fb.group({
        // projectKey only required in setupMode, validators set in ngOnInit
        projectKey: [''],
        dataDir: ['', Validators.required], // dataDir is typically always required
        modelDir: [{ value: '', disabled: true }], // defaults to disabled due to useDefaultModelDir: true
        useDefaultModelDir: [true],
      }),
      keypoints: this.fb.group({
        keypointNames: [''],
      }),
      multiview: this.fb.group({
        views: [''],
      }),
    });

    // Assign nested form groups to protected instance fields
    this.directoriesForm = this.projectInfoForm.get('directories') as FormGroup;
    this.keypointsForm = this.projectInfoForm.get('keypoints') as FormGroup;
    this.multiviewForm = this.projectInfoForm.get('multiview') as FormGroup;

    const dataDirControl = this.directoriesForm.get('dataDir');
    const modelDirControl = this.directoriesForm.get('modelDir');
    const useDefaultModelDirControl =
      this.directoriesForm.get('useDefaultModelDir');

    useDefaultModelDirControl?.valueChanges.subscribe((useDefault) => {
      if (useDefault) {
        modelDirControl?.disable();
        modelDirControl?.setValue(
          this.getDefaultModelDir(dataDirControl?.value),
        );
      } else {
        modelDirControl?.enable();
      }
    });
    dataDirControl?.valueChanges.subscribe((dataDir) => {
      if (useDefaultModelDirControl?.value) {
        this.directoriesForm
          .get('modelDir')
          ?.setValue(this.getDefaultModelDir(dataDir));
      }
    });
  }

  ngOnInit() {
    // Conditionally apply Validators.required to projectKey if in setup mode
    const projectKeyControl = this.directoriesForm.get('projectKey');
    if (this.setupMode()) {
      projectKeyControl?.setValidators(Validators.required);
    } else {
      projectKeyControl?.clearValidators();
    }
    projectKeyControl?.updateValueAndValidity();

    // Init the form with existing project settings from server.
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
          directories: {
            projectKey: this.projectKey(),
            dataDir: projectInfo.data_dir,
            useDefaultModelDir: isDefault,
          },
          multiview: {
            views: projectInfo.views.join('\n'),
          },
          keypoints: {
            keypointNames: projectInfo.keypoint_names.join('\n'),
          },
        });

        if (!isDefault) {
          this.directoriesForm.patchValue({
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

  protected async handleSaveClick() {
    this.saveSuccessMessage.set('');
    if (this.saveSuccessMessageClearTimerId) {
      clearInterval(this.saveSuccessMessageClearTimerId);
      this.saveSuccessMessageClearTimerId = 0;
    }

    const useDefaultModelDir =
      this.directoriesForm.get('useDefaultModelDir')?.value;
    const key = this.directoriesForm.get('projectKey')?.value;

    if (!key) {
      throw new Error('Project key is missing!');
    }

    if (this.setupMode()) {
      // Creation mode
      // Extract values from form groups and create a new project with them.
      const dataDir: string = this.directoriesForm.get('dataDir')?.value ?? '';
      const modelDir: string | null = useDefaultModelDir
        ? null
        : (this.directoriesForm.get('modelDir')?.value ?? null);

      await this.projectInfoService.createNewProject({
        projectKey: key,
        data_dir: dataDir,
        model_dir: modelDir ?? undefined,
        projectInfo: {
          views: this.parseTextAsList(
            this.multiviewForm.get('views')?.value ?? '',
          ),
          keypoint_names: this.parseTextAsList(
            this.keypointsForm.get('keypointNames')?.value ?? '',
          ),
        },
      });
    } else {
      // Edit mode
      const projectInfo = {} as Partial<ProjectInfo>;

      // Check for changes in the 'directories' form group
      if (this.directoriesForm.get('dataDir')?.dirty) {
        projectInfo.data_dir = this.directoriesForm.get('dataDir')?.value ?? '';
      }

      if (
        this.directoriesForm.get('useDefaultModelDir')?.dirty ||
        this.directoriesForm.get('modelDir')?.dirty
      ) {
        if (!useDefaultModelDir) {
          projectInfo.model_dir =
            this.directoriesForm.get('modelDir')?.value ?? '';
        } else {
          const d: string = this.directoriesForm.get('dataDir')?.value ?? '';
          projectInfo.model_dir = this.getDefaultModelDir(d);
        }
      }

      // Check for changes in the 'multiview' form group
      if (this.multiviewForm.get('views')?.dirty) {
        projectInfo.views = this.parseTextAsList(
          this.multiviewForm.get('views')?.value ?? '',
        );
      }

      // Check for changes in the 'keypoints' form group
      if (this.keypointsForm.get('keypointNames')?.dirty) {
        projectInfo.keypoint_names = this.parseTextAsList(
          this.keypointsForm.get('keypointNames')?.value ?? '',
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
  protected selectedTabIndex = computed(() =>
    this.tabs.findIndex((t) => t.key === this.selectedTab()),
  );
  protected handleNextClick() {
    const currentTabKey = this.tabs[this.selectedTabIndex()].key;
    let currentFormGroup: FormGroup | undefined;

    switch (currentTabKey) {
      case 'directories':
        currentFormGroup = this.directoriesForm;
        break;
      case 'keypoints':
        currentFormGroup = this.keypointsForm;
        break;
      case 'multiview':
        currentFormGroup = this.multiviewForm;
        break;
      default:
        console.warn(`Unknown tab key: ${currentTabKey}`);
        return;
    }

    if (currentFormGroup && currentFormGroup.valid) {
      if (this.selectedTabIndex() === this.tabs.length - 1)
        throw new Error('Should not display next button on last tab');
      this.selectedTab.set(this.tabs[this.selectedTabIndex() + 1]!.key);
    } else {
      // If not valid, mark controls in the current tab's form group as touched
      // to display validation errors.
      currentFormGroup?.markAllAsTouched();
      this.cdr.detectChanges(); // Force change detection to show errors immediately
    }
  }

  // Helper methods to check validity of each step's form group
  protected isDirectoriesFormValid(): boolean {
    return this.directoriesForm.valid;
  }

  protected isKeypointsFormValid(): boolean {
    return this.keypointsForm.valid;
  }

  protected isMultiviewFormValid(): boolean {
    return this.multiviewForm.valid;
  }
}
