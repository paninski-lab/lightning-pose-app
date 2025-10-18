import {
  ChangeDetectionStrategy,
  Component,
  signal,
  viewChild,
} from '@angular/core';
import { CreateModelDialogComponent } from '../create-model-dialog/create-model-dialog.component';

import { ModelsListComponent } from '../models-list/models-list.component';
import { ModelListResponseEntry } from '../modelconf';
import { ModelDetailComponent } from './model-detail/model-detail.component';

@Component({
  selector: 'app-models-page',
  imports: [
    CreateModelDialogComponent,
    ModelsListComponent,
    ModelDetailComponent,
  ],
  templateUrl: './models-page.component.html',
  styleUrl: './models-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelsPageComponent {
  protected isCreateModelDialogOpen = signal(false);

  private modelsListComponent = viewChild(ModelsListComponent);
  protected selectedModel = signal<ModelListResponseEntry | null>(null);

  handleCreateModelDialogDone() {
    this.isCreateModelDialogOpen.set(false);
    this.modelsListComponent()?.reloadModels();
  }
}
