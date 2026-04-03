import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LabelFilePickerComponent } from './label-file-picker.component';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('LabelFilePickerComponent', () => {
  let component: LabelFilePickerComponent;
  let fixture: ComponentFixture<LabelFilePickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LabelFilePickerComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LabelFilePickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
