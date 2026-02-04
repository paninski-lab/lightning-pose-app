import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { mvf, MVFrame } from '../labeler/frame.model';
import { RpcService } from '../rpc.service';
import { MVLabelFile } from '../label-file.model';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Subscription } from 'rxjs';
import { ProjectInfoService } from '../project-info.service';
import { HighlightDirective } from '../highlight.directive';
import { DecimalPipe } from '@angular/common';

interface BundleAdjustResponse {
  camList: string[];
  oldReprojectionError: number[];
  newReprojectionError: number[];

  /** CameraGroup dictionaries (pre-adjustment), one per camera. */
  oldCgDicts: Record<string, unknown>[];

  /** CameraGroup dictionaries (post-adjustment), one per camera. */
  newCgDicts: Record<string, unknown>[];

  /** Full CameraGroup TOML (pre-adjustment). */
  oldCgToml: string;

  /** Full CameraGroup TOML (post-adjustment). */
  newCgToml: string;
}

type CameraParamsViewMode = 'json' | 'toml';

@Component({
  selector: 'app-bundle-adjust-dialog',
  imports: [HighlightDirective, DecimalPipe],
  templateUrl: './bundle-adjust-dialog.component.html',
  styleUrl: './bundle-adjust-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BundleAdjustDialogComponent {
  private rpc = inject(RpcService);
  private destroyRef = inject(DestroyRef);
  private projectInfoService = inject(ProjectInfoService);

  protected readonly mvf = mvf;
  labelFile = input.required<MVLabelFile | null>();
  frame = input.required<MVFrame | null>();
  numLabeledFrames = input.required<number>();

  private runSubscription?: Subscription;
  private saveSubscription?: Subscription;

  protected baLoading = signal(false);
  protected baSaving = signal(false);
  protected baSavingSuccess = signal(false);
  protected baResponse = signal<BundleAdjustResponse | null>(null);

  protected cameraParamsViewMode = signal<CameraParamsViewMode>('toml');

  /** If true: optimize extrinsics only. If false: optimize intrinsics + extrinsics. */
  protected optimizeExtrinsicsOnly = signal(true);

  protected handleOptimizeModeChange(onlyExtrinsics: boolean) {
    this.optimizeExtrinsicsOnly.set(onlyExtrinsics);
  }

  protected getOldCameraParamsText(): string {
    const resp = this.baResponse();
    if (!resp) return '';
    if (this.cameraParamsViewMode() === 'toml') return resp.oldCgToml;
    return this.formatJson(resp.oldCgDicts);
  }

  protected getNewCameraParamsText(): string {
    const resp = this.baResponse();
    if (!resp) return '';
    if (this.cameraParamsViewMode() === 'toml') return resp.newCgToml;
    return this.formatJson(resp.newCgDicts);
  }

  protected handleCameraParamsModeToggle(checked: boolean) {
    // unchecked => JSON, checked => TOML
    this.cameraParamsViewMode.set(checked ? 'toml' : 'json');
  }

  protected handleToggleOptimizeMode() {
    this.optimizeExtrinsicsOnly.update((v) => !v);
  }

  protected resetState() {
    // Resets state on dialog close.
    this.baResponse.set(null);
    this.baLoading.set(false);
    this.baSaving.set(false);
    this.baSavingSuccess.set(false);
    this.cameraParamsViewMode.set('json');

    if (this.runSubscription) {
      this.runSubscription.unsubscribe();
    }
    if (this.saveSubscription) {
      this.saveSubscription.unsubscribe();
    }
  }

  protected handleBundleAdjustClick() {
    const baRequest = {
      projectKey: this.projectInfoService['projectContext']()?.key as string,
      sessionKey: mvf(this.frame()!).autolabelSessionKey,
      mvlabelfile: this.labelFile(),
      addl_bundle_adjust_kwargs: {
        only_extrinsics: this.optimizeExtrinsicsOnly(),
      },
    };

    if (this.runSubscription) {
      this.runSubscription.unsubscribe();
    }
    this.baLoading.set(true);
    this.runSubscription = this.rpc
      .callObservable('bundleAdjust', baRequest)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .pipe(
        finalize(() => {
          this.baLoading.set(false);
        }),
      )
      .subscribe((response: unknown) => {
        this.baResponse.set(response as BundleAdjustResponse);
      });
  }

  protected handleSaveClick() {
    const resp = this.baResponse();
    const projectKey = this.projectInfoService['projectContext']()?.key as
      | string
      | undefined;
    const sessionKey = this.frame()
      ? mvf(this.frame()!).autolabelSessionKey
      : null;

    if (!resp || !projectKey || !sessionKey) {
      // Nothing to save (or we don't have enough context).
      return;
    }

    const request = {
      projectKey,
      sessionKey, // expected to be "view stripped out" already
      newCgToml: resp.newCgToml,
    };

    if (this.saveSubscription) {
      this.saveSubscription.unsubscribe();
    }

    this.baSaving.set(true);
    this.saveSubscription = this.rpc
      .callObservable('saveCalibrationForSession', request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .pipe(
        finalize(() => {
          this.baSaving.set(false);
        }),
      )
      .subscribe(() => {
        this.baSavingSuccess.set(true);
      });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  open() {
    (
      document.getElementById('bundle_adjustment') as HTMLDialogElement
    ).showModal();
  }

  protected close() {
    (document.getElementById('bundle_adjustment') as HTMLDialogElement).close();
  }

  protected formatJson(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
}
