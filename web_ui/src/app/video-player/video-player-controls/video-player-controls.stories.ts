import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular';
import { VideoPlayerState } from '../video-player-state';
import { VideoPlayerControlsComponent } from './video-player-controls.component';

/** Renders the control bar with a duration and no video file. */
@Component({
  selector: 'video-controls-story',
  imports: [VideoPlayerControlsComponent],
  providers: [VideoPlayerState],
  template: `
    <div class="max-w-5xl bg-base-100 pt-48">
      <app-video-player-controls />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class VideoControlsStoryComponent {
  constructor() {
    const state = inject(VideoPlayerState);
    state.fps.set(30);
    state.duration.set(10);
  }
}

const meta: Meta<VideoControlsStoryComponent> = {
  title: 'App/VideoPlayer/VideoPlayerControls',
  component: VideoControlsStoryComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<VideoControlsStoryComponent>;

export const WithDuration: Story = {};
