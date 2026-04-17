import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActiveTaskService } from '../../active-task.service';

@Component({
  selector: 'app-active-task-indicator',
  standalone: true,
  imports: [],
  templateUrl: './active-task-indicator.component.html',
  styleUrl: './active-task-indicator.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveTaskIndicatorComponent {
  taskService = inject(ActiveTaskService);

  get tooltipText(): string {
    const task = this.taskService.activeTask();
    if (!task) return '';
    if (task.type === 'training') return 'Training a model';
    if (task.type === 'inference') return 'Running inference';
    return 'Active task';
  }
}
