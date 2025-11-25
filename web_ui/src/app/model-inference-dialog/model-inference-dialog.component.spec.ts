import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModelInferenceDialogComponent } from './model-inference-dialog.component';

describe('ModelInferenceDialogComponent', () => {
  let component: ModelInferenceDialogComponent;
  let fixture: ComponentFixture<ModelInferenceDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelInferenceDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModelInferenceDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
