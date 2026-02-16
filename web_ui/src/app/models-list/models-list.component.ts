import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
import { ModelDeleteDialogComponent } from '../models-page/model-delete-dialog/model-delete-dialog.component';
import { ModelRenameDialogComponent } from '../models-page/model-rename-dialog/model-rename-dialog.component';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-models-list',
  imports: [
    DatePipe,
    ModelTypeLabelPipe,
    CdkListboxModule,
    PathPipe,
    ModelDeleteDialogComponent,
    ModelRenameDialogComponent,
  ],
  templateUrl: './models-list.component.html',
  styleUrl: './models-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelsListComponent implements OnInit, OnDestroy {
  models = signal<ModelListResponse>({ models: [] });

  private sessionService = inject(SessionService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  selectedModel = model<ModelListResponseEntry | null>();
  inlineActionModel = model<ModelListResponseEntry | null>();
  actionSelectedModels = model<ModelListResponseEntry[]>([]);
  private pollInterval?: number;

  private queryParamsSub?: Subscription;
  private cdr = inject(ChangeDetectorRef);

  protected cdkListboxCompareFn(
    a: ModelListResponseEntry,
    b: ModelListResponseEntry,
  ): boolean {
    return a.model_relative_path === b.model_relative_path;
  }

  ngOnInit() {
    // Keep model selection in sync with URL (?modelKey=...)
    // Any URL change triggers reloadModels(), then selects the model matching modelKey.
    this.queryParamsSub = this.route.queryParamMap.subscribe((params) => {
      const modelKeyFromUrl = params.get('modelKey');
      (async () => {
        await this.reloadModels();

        if (!modelKeyFromUrl) return;

        const fromUrl =
          this.models().models.find(
            (m) => m.model_relative_path === modelKeyFromUrl,
          ) ?? null;

        this.selectedModel.set(fromUrl);
        // Some bug is preventing the selection from rendering in the UI
        // on initial page load (until the first poll hits).
        // This fixes it. Unknown why. Everything in this component uses signals.
        setTimeout(() => this.cdr.markForCheck(), 0);
      })();
    });

    this.pollInterval = setInterval(() => {
      //this.reloadModels();
    }, 2500) as unknown as number;
  }

  ngOnDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    if (this.queryParamsSub) {
      this.queryParamsSub.unsubscribe();
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

    // Store selected modelKey in URL query params.
    // Updating the URL will trigger the queryParamMap subscription above, which calls
    // reloadModels() and then re-selects based on the URL.
    const modelKey = this.selectedModel()?.model_relative_path ?? undefined;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { modelKey },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  getCdkListboxValue(): ModelListResponseEntry[] {
    return this.selectedModel() ? [this.selectedModel()!] : [];
  }

  /*
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
  */

  protected handleModelInlineActionDelete(
    e: MouseEvent,
    m: ModelListResponseEntry,
  ) {
    e.stopPropagation();
    this.inlineActionModel.set(m);
    this.isDeleteDialogOpen.set(true);
  }

  protected handleModelInlineActionRename(
    e: MouseEvent,
    m: ModelListResponseEntry,
  ) {
    e.stopPropagation();
    this.inlineActionModel.set(m);
    this.isRenameDialogOpen.set(true);
  }

  protected handleDeleteDialogDone(deleted: boolean) {
    this.isDeleteDialogOpen.set(false);
    if (deleted) {
      this.reloadModels();
    }
  }

  protected isDeleteDialogOpen = signal(false);

  protected handleRenameDialogDone(deleted: boolean) {
    this.isRenameDialogOpen.set(false);
    if (deleted) {
      this.reloadModels();
    }
  }

  protected isRenameDialogOpen = signal(false);
}
