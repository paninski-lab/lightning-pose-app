import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-sandbox',
  imports: [],
  templateUrl: './sandbox.component.html',
  styleUrl: './sandbox.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SandboxComponent {}
