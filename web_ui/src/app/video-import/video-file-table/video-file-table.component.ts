import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ParsedItem } from '../video-import.types';

@Component({
  selector: 'app-video-file-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-file-table.component.html',
  styleUrl: './video-file-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VideoFileTableComponent {
  @Input({ required: true }) items: ParsedItem[] = [];
  @Input() uploading = false;
  @Output() removeAt = new EventEmitter<number>();

  formatBytes(n: number): string {
    if (!Number.isFinite(n) || n < 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let idx = 0;
    let val = n;
    while (val >= 1024 && idx < units.length - 1) {
      val /= 1024;
      idx++;
    }
    return `${val.toFixed(val < 10 && idx > 0 ? 1 : 0)} ${units[idx]}`;
  }
}
