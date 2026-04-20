import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ProjectInfoService } from '../project-info.service';
import { SessionService } from '../session.service';
import { ToastService } from '../toast.service';
import { ModelListResponseEntry } from '../modelconf';
import { fileNameValidator } from '../utils/validators';

@Component({
  selector: 'app-create-eks-model-dialog',
  imports: [ReactiveFormsModule],
  templateUrl: './create-eks-model-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateEksModelDialogComponent implements OnInit {
  done = output<string | null>();

  private fb = inject(NonNullableFormBuilder);
  private projectInfoService = inject(ProjectInfoService);
  private sessionService = inject(SessionService);
  private toastService = inject(ToastService);

  protected availableModels = signal<ModelListResponseEntry[]>([]);

  protected form = this.fb.group({
    modelName: ['', [Validators.required, fileNameValidator]],
    memberIds: [[] as string[], Validators.required],
    smoothParam: [1000, [Validators.required, Validators.min(0)]],
    quantileKeepPca: [
      50.0,
      [Validators.required, Validators.min(0), Validators.max(100)],
    ],
  });

  async ngOnInit() {
    const resp = await this.sessionService.listModels();
    this.availableModels.set(
      resp.models.filter(
        (m) => m.model_kind === 'normal' && m.status?.status === 'COMPLETED',
      ),
    );
  }

  handleCloseClick() {
    this.done.emit(null);
  }

  protected toggleMember(modelPath: string) {
    const current = this.form.controls.memberIds.value;
    if (current.includes(modelPath)) {
      this.form.controls.memberIds.setValue(
        current.filter((id) => id !== modelPath),
      );
    } else {
      this.form.controls.memberIds.setValue([...current, modelPath]);
    }
  }

  protected isMemberSelected(modelPath: string): boolean {
    return this.form.controls.memberIds.value.includes(modelPath);
  }

  async onCreateClick() {
    if (this.form.invalid) return;

    const { modelName, memberIds, smoothParam, quantileKeepPca } = this.form
      .value as {
      modelName: string;
      memberIds: string[];
      smoothParam: number;
      quantileKeepPca: number;
    };

    const viewNames = this.projectInfoService.projectInfo.views;

    await this.sessionService.createEksModel({
      modelName,
      members: memberIds.map((id) => ({ id })),
      view_names: viewNames,
      smooth_param: smoothParam,
      quantile_keep_pca: quantileKeepPca,
    });

    this.toastService.showToast({
      content: 'Successfully created EKS model',
      variant: 'success',
    });

    this.done.emit(modelName);
  }
}
