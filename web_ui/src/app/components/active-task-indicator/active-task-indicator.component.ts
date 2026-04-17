import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActiveTaskService } from '../../active-task.service';
import { ProjectInfoService } from '../../project-info.service';

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
  projectInfoService = inject(ProjectInfoService);

  get tooltipText(): string {
    const task = this.taskService.activeTask();
    if (!task) return '';

    let baseText = 'Active task';
    if (task.type === 'training') baseText = 'Training a model';
    if (task.type === 'inference') baseText = 'Running inference';

    const currentProjectKey = this.projectInfoService.projectContext()?.key;
    if (task.projectKey && task.projectKey !== currentProjectKey) {
      return `${baseText} (Project: ${task.projectKey})`;
    }

    return baseText;
  }
}
