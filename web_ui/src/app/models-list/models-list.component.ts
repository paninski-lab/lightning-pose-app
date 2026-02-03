import {
  ChangeDetectionStrategy,
  Component,
  inject,
  model,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ModelTypeLabelPipe, PathPipe } from '../utils/pipes';
import { SessionService } from '../session.service';
import {
  ModelListResponse,
  ModelListResponseEntry,
  mc_util,
} from '../modelconf';
import { CdkListboxModule } from '@angular/cdk/listbox';
import { ToastService } from '../toast.service';

@Component({
  selector: 'app-models-list',
  imports: [DatePipe, ModelTypeLabelPipe, CdkListboxModule, PathPipe],
  templateUrl: './models-list.component.html',
  styleUrl: './models-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelsListComponent implements OnInit, OnDestroy {
  models = signal<ModelListResponse>({ models: [] });

  private sessionService = inject(SessionService);
  private toast = inject(ToastService);
  selectedModel = model<ModelListResponseEntry | null>();
  actionSelectedModels = model<ModelListResponseEntry[]>([]);
  private pollInterval?: number;
  protected cdkListboxCompareFn(
    a: ModelListResponseEntry,
    b: ModelListResponseEntry,
  ): boolean {
    return a.model_relative_path === b.model_relative_path;
  }

  ngOnInit() {
    this.reloadModels();
    this.pollInterval = setInterval(() => {
      this.reloadModels();
    }, 1500) as unknown as number;
  }

  ngOnDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  async reloadModels() {
    try {
      const resp = await this.sessionService.listModels();
      const newSelectedModelReference =
        resp.models.find(
          (m) =>
            m.model_relative_path === this.selectedModel()?.model_relative_path,
        ) ?? null;
      this.models.set(resp);
      this.selectedModel.set(newSelectedModelReference);
    } catch (e) {
      this.toast.showToast({
        content: 'Failed to refresh models list',
        variant: 'error',
      });
    }
  }

  protected mc_util(m: ModelListResponseEntry): mc_util {
    return new mc_util(m);
  }

  handleCdkListboxChange(cdkListboxValue: readonly ModelListResponseEntry[]) {
    if (cdkListboxValue.length === 0) {
      this.selectedModel.set(null);
    } else {
      this.selectedModel.set(cdkListboxValue[0]);
    }
  }

  getCdkListboxValue(): ModelListResponseEntry[] {
    return this.selectedModel() ? [this.selectedModel()!] : [];
  }

  protected handleSelectModelForAction(m: ModelListResponseEntry) {
    this.actionSelectedModels.update((models) => {
      if (
        models.findIndex(
          (x) => x.model_relative_path === m.model_relative_path,
        ) === -1
      ) {
        return [...models, m];
      } else {
        return models.filter(
          (x) => x.model_relative_path !== m.model_relative_path,
        );
      }
    });
  }

  protected isModelSelectedForAction(m: ModelListResponseEntry) {
    return (
      this.actionSelectedModels().findIndex(
        (x) => x.model_relative_path === m.model_relative_path,
      ) !== -1
    );
  }
}
