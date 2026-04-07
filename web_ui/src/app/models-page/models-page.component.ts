import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import CreateModelDialogComponent from '../create-model-dialog/create-model-dialog.component';

import { ModelsListComponent } from '../models-list/models-list.component';
import { ModelListResponseEntry } from '../modelconf';
import { ModelDetailComponent } from './model-detail/model-detail.component';
import { ModelInferenceDialogComponent } from '../model-inference-dialog/model-inference-dialog.component';
import { SplitAreaComponent, SplitComponent } from 'angular-split';
import {
  DropdownComponent,
  DropdownContentComponent,
  DropdownTriggerComponent,
  DropdownTriggerDirective,
} from '../components/dropdown/dropdown.component';
import { ProjectInfoService } from '../project-info.service';

@Component({
  selector: 'app-models-page',
  imports: [
    CreateModelDialogComponent,
    ModelsListComponent,
    ModelDetailComponent,
    ModelInferenceDialogComponent,
    SplitComponent,
    SplitAreaComponent,
    DropdownComponent,
    DropdownTriggerComponent,
    DropdownContentComponent,
    DropdownTriggerDirective,
  ],
  templateUrl: './models-page.component.html',
  styleUrl: './models-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelsPageComponent {
  protected projectInfo = inject(ProjectInfoService);
  protected isCreateModelDialogOpen = signal(false);
  protected isInferenceDialogOpen = signal(false);

  private modelsListComponent = viewChild(ModelsListComponent);
  private modelsDetailComponent = viewChild(ModelDetailComponent);
  protected selectedModel = signal<ModelListResponseEntry | null>(null);
  protected selectedModelsForAction = signal<ModelListResponseEntry[]>([]);

  async handleCreateModelDialogDone(modelName: string | null) {
    this.isCreateModelDialogOpen.set(false);
    await this.modelsListComponent()?.reloadModels();
    if (modelName) {
      const newlyCreatedModel = this.modelsListComponent()!
        .models()
        .models.find((m) => m.model_relative_path === modelName);
      if (newlyCreatedModel) {
        this.selectedModel.set(newlyCreatedModel);
        this.modelsDetailComponent()?.activeTab.set('logs');
      }
    }
  }

  openInferenceDialog() {
    if (!this.selectedModel()) return;
    this.isInferenceDialogOpen.set(true);
  }

  handleInferenceDialogDone() {
    this.isInferenceDialogOpen.set(false);
  }
}
