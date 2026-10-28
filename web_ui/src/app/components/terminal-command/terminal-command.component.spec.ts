import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TerminalCommandComponent } from './terminal-command.component';

describe('TerminalCommandComponent', () => {
  let fixture: ComponentFixture<TerminalCommandComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TerminalCommandComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TerminalCommandComponent);
    fixture.componentRef.setInput('command', 'test-command');
    fixture.detectChanges();
  });

  it('should render the command', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('test-command');
  });

});
