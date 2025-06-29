import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  input,
  linkedSignal,
  OnDestroy,
  OnInit,
  Output,
  signal,
  ViewChild,
} from '@angular/core';
import { VideoPlayerState } from '../video-player-state';
import { VideoMetadata } from '../../../video-metadata';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

const videoErrorMessages: Record<number, string> = {
  [MediaError.MEDIA_ERR_ABORTED]: 'Error: aborted.',
  [MediaError.MEDIA_ERR_NETWORK]: 'Error: network error.',
  [MediaError.MEDIA_ERR_DECODE]: 'Error: decoding error.',
  [MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED]:
    'Error: 404 or unsupported video format.',
};

/**
 * The VideoTileComponent displays a video.
 *
 * Play / pause / seek are controlled by `VideoPlayerState`. If the component is deemed Primary by
 * the VideoPlayerState, it updates the VideoPlayerState of the currentTime of playback, in order
 * to synchronize with other video players.
 *
 * The parent component can content-project other components like Keypoints. The video player
 * projects such components into a relatively positioned div, so children can be absolutely positioned
 * within.
 *
 * Inputs:
 * - `src`: A signal input for the video source URL.
 */
@Component({
  selector: 'app-video-tile',
  imports: [],
  templateUrl: './video-tile.component.html',
  styleUrl: './video-tile.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoTileComponent implements OnDestroy, OnInit {
  @ViewChild('videoEl', { static: true }) videoElement: ElementRef | null =
    null;

  src = input<string>('');

  // Current time of the video element, for displaying for debug info.
  protected localCurrentTime = signal<number>(0);

  protected videoErrorMessage = linkedSignal(() => {
    // Re-initialize this signal to '' whenever src changes.
    this.src(); //setup dependency.
    return '';
  });

  // the main state, injected from parent so it can be easily shared across video players
  videoPlayerState: VideoPlayerState = inject(VideoPlayerState);

  @Output() contentEnd = new EventEmitter<void>();

  constructor(private host: ElementRef) {
    this.videoPlayerState.registerVideoPlayer(this);
    combineLatest([
      this.videoPlayerState.currentTime,
      this.videoPlayerState.isPlaying,
    ])
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.updateLocalCurrentTime();
      });
  }

  ngOnInit() {
    const observer = new ResizeObserver(() => {
      this.updateScaleFactorSignal();
    });

    observer.observe(this.host.nativeElement);
  }

  ngOnDestroy() {
    this.videoPlayerState.unregisterVideoPlayer(this);
  }

  videoMetadata = new BehaviorSubject<VideoMetadata>({
    duration: 0,
    width: 0,
    height: 0,
  });

  scaleFactor = signal<number>(1);

  // signal to hide content until video inited
  protected showProjectedContent = signal(false);

  protected onVideoTagError() {
    const code = this.videoElement?.nativeElement.error?.code as
      | number
      | undefined;
    const videoErrorMessage = code
      ? videoErrorMessages[code]
      : 'Unknown error, check dev logs.';
    this.videoErrorMessage.set(videoErrorMessage);
  }

  protected onLoadedMetadata() {
    this.videoMetadata.next({
      height: this.videoElement?.nativeElement.videoHeight ?? 1,
      width: this.videoElement?.nativeElement.videoWidth ?? 1,
      duration: this.videoElement?.nativeElement.duration ?? 0,
    });

    this.updateScaleFactorSignal();

    this.showProjectedContent.set(true);
  }

  private updateScaleFactorSignal() {
    this.scaleFactor.set(
      this.host.nativeElement.clientWidth / this.videoMetadata.value.width,
    );
  }

  protected updateLocalCurrentTime() {
    this.localCurrentTime.set(
      this.videoElement?.nativeElement.currentTime ?? 0,
    );
  }

  protected onEnd() {
    this.updateLocalCurrentTime();
    this.contentEnd.emit();
  }
}
