import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CreateModelDialogComponent } from '../create-model-dialog/create-model-dialog.component';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-models-page',
  imports: [DatePipe, CreateModelDialogComponent],
  templateUrl: './models-page.component.html',
  styleUrl: './models-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelsPageComponent {
  private session = inject(SessionService);

  protected models = signal<{ id: string; name: string; type?: string; creationDate?: string; epochsTrained?: number; trainTestSplit?: string; status?: string }[]>([]);
  protected isCreateModelDialogOpen = signal(false);

  constructor() {
    this.reloadModels();
  }

  async reloadModels() {
    const list = await this.session.listModels();
    // For now, we only map name/id and leave other columns blank.
    this.models.set(list.map((m) => ({ id: m.id, name: m.name, status: m.status })));
  }
}
