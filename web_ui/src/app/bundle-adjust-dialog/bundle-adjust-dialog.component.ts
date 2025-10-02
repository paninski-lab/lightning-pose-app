import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  Input,
  input,
  signal,
} from '@angular/core';
import { mvf, MVFrame } from '../labeler/frame.model';
import { RpcService } from '../rpc.service';
import { MVLabelFile } from '../label-file.model';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, Subscription } from 'rxjs';

interface BundleAdjustResponse {
  camList: string[];
  oldReprojectionError: number[];
  newReprojectionError: number[];
}

@Component({
  selector: 'app-bundle-adjust-dialog',
  imports: [],
  templateUrl: './bundle-adjust-dialog.component.html',
  styleUrl: './bundle-adjust-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BundleAdjustDialogComponent implements AfterViewInit {
  private rpc = inject(RpcService);
  private destroyRef = inject(DestroyRef);

  protected readonly mvf = mvf;
  labelFile = input.required<MVLabelFile | null>();
  frame = input.required<MVFrame | null>();
  numLabeledFrames = input.required<number>();

  private runSubscription?: Subscription;
  protected baLoading = signal(false);
  protected baResponse = signal<BundleAdjustResponse | null>(null);
  private resetState() {
    // Resets state on dialog close.
    this.baResponse.set(null);
    this.baLoading.set(false);
    if (this.runSubscription) {
      this.runSubscription.unsubscribe();
    }
  }
  ngAfterViewInit() {
    (
      document.getElementById('bundle_adjustment') as HTMLDialogElement
    ).addEventListener('close', () => {
      this.resetState();
    });
  }

  protected handleBundleAdjustClick() {
    const baRequest = {
      sessionKey: mvf(this.frame()!).autolabelSessionKey,
      mvlabelfile: this.labelFile(),
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  open() {
    (
      document.getElementById('bundle_adjustment') as HTMLDialogElement
    ).showModal();
  }
}
