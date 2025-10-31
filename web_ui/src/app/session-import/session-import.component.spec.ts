import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SessionImportComponent } from './session-import.component';

describe('SessionImportComponent', () => {
  let component: SessionImportComponent;
  let fixture: ComponentFixture<SessionImportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SessionImportComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SessionImportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
