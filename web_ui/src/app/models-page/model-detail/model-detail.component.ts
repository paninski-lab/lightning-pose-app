import {
  ChangeDetectionStrategy,
  Component,
  input,
  OnChanges,
  signal,
} from '@angular/core';
import { ModelListResponseEntry } from '../../modelconf';
import { JsonPipe } from '@angular/common';

@Component({
  selector: 'app-model-detail',
  imports: [JsonPipe],
  templateUrl: './model-detail.component.html',
  styleUrl: './model-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelDetailComponent implements OnChanges {
  selectedModel = input.required<ModelListResponseEntry | null>();
  activeTab = signal('general');
  ngOnChanges() {
    // might want to load stuff related to the selected model?
    return;
  }
}
