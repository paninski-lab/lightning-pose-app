import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LoadingService } from '../loading.service';

@Component({
  selector: 'app-loading-bar',
  imports: [],
  templateUrl: './loading-bar.component.html',
  styleUrl: './loading-bar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingBarComponent {
  x = inject(LoadingService);
}
