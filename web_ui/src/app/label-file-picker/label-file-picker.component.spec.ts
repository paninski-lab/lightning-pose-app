import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LabelFilePickerComponent } from './label-file-picker.component';

describe('LabelFilePickerComponent', () => {
  let component: LabelFilePickerComponent;
  let fixture: ComponentFixture<LabelFilePickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LabelFilePickerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LabelFilePickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
