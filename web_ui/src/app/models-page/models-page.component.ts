import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CreateModelDialogComponent } from '../create-model-dialog/create-model-dialog.component';

@Component({
  selector: 'app-models-page',
  imports: [DatePipe, CreateModelDialogComponent],
  templateUrl: './models-page.component.html',
  styleUrl: './models-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModelsPageComponent {
  protected models = [
    {
      id: 'supervised_test',
      name: 'supervised_test',
      type: 'Supervised',
      creationDate: '09/10/2025',
      epochsTrained: 300,
      trainTestSplit: '100/20',
    },
    {
      id: 'semisupervised_test',
      name: 'semisupervised_test',
      type: 'Semisupervised',
      creationDate: '09/10/2025',
      epochsTrained: 255,
      trainTestSplit: '100/20',
    },
  ];
  protected isCreateModelDialogOpen = signal(false);

  constructor() {
    //this.models = [];
  }
}
