import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FFProbeInfo } from '../../ffprobe-info';
import { PathDisplayComponent } from '../../components/path-display/path-display.component';

@Component({
  selector: 'app-ffprobe-info',
  standalone: true,
  imports: [PathDisplayComponent],
  templateUrl: './ffprobe-info.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FFProbeInfoComponent {
  data = input.required<FFProbeInfo>();

  protected formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  protected formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 100);
    return `${minutes}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }
}
