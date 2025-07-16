import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LabelerCenterPanelComponent } from './labeler-center-panel.component';

describe('LabelerCenterPanelComponent', () => {
  let component: LabelerCenterPanelComponent;
  let fixture: ComponentFixture<LabelerCenterPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LabelerCenterPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LabelerCenterPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
