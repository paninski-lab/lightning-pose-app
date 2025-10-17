import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { CreateModelDialogComponent } from '../create-model-dialog/create-model-dialog.component';
import { SessionService } from '../session.service';
import {
  ModelConfig,
  ModelListResponse,
  ModelListResponseEntry,
  ModelType,
} from '../modelconf';

class mc_util {
  constructor(private m: ModelListResponseEntry) {}
  get c() {
    return this.m.config;
  }
  get name() {
    return this.m.model_name;
  }
  get type() {
    if ((this.c!.model.losses_to_use?.length ?? 0) > 0) {
      return this.c!.model.model_type.endsWith('mhcrnn')
        ? ModelType.S_SUP_CTX
        : ModelType.S_SUP;
    } else {
      return this.c!.model.model_type.endsWith('mhcrnn')
        ? ModelType.SUP_CTX
        : ModelType.SUP;
    }
  }
  get createdAt(): string {
    return this.m.created_at;
  }
  get status(): string {
    return this.m.status?.status ?? '';
  }
}

@Component({
  selector: 'app-models-page',
  imports: [DatePipe, CreateModelDialogComponent],
  templateUrl: './models-page.component.html',
  styleUrl: './models-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelsPageComponent {
  private session = inject(SessionService);

  protected models = signal<ModelListResponse>({ models: [] });
  protected isCreateModelDialogOpen = signal(false);

  constructor() {
    this.reloadModels();
  }

  async reloadModels() {
    const resp = await this.session.listModels();
    this.models.set(resp);
  }

  protected mc_util(m: ModelListResponseEntry): mc_util {
    return new mc_util(m);
  }
}
