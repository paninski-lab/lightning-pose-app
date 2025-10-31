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
import { ModelTypeLabelPipe } from '../utils/pipes';
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
  imports: [DatePipe, ModelTypeLabelPipe, CdkListboxModule],
  templateUrl: './models-list.component.html',
  styleUrl: './models-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelsListComponent implements OnInit, OnDestroy {
  protected models = signal<ModelListResponse>({ models: [] });

  private sessionService = inject(SessionService);
  private toast = inject(ToastService);
  selectedModel = model<ModelListResponseEntry | null>();
  private pollInterval?: number;

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
      this.models.set(resp);
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
}
