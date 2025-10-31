import {
  ChangeDetectionStrategy,
  Component,
  inject,
  model,
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

@Component({
  selector: 'app-models-list',
  imports: [DatePipe, ModelTypeLabelPipe, CdkListboxModule],
  templateUrl: './models-list.component.html',
  styleUrl: './models-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelsListComponent implements OnInit {
  protected models = signal<ModelListResponse>({ models: [] });

  private sessionService = inject(SessionService);
  selectedModel = model<ModelListResponseEntry | null>();

  ngOnInit() {
    this.reloadModels();
  }

  async reloadModels() {
    const resp = await this.sessionService.listModels();
    this.models.set(resp);
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

  protected statusTooltip(m: ModelListResponseEntry) {
    if (m.status?.status === 'FAILED') {
      return 'probably training';
    } else {
      return 'matt demo';
    }
  }
}
