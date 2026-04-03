import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModelDeleteDialogComponent } from './model-delete-dialog.component';

describe('ModelDeleteDialogComponent', () => {
  let component: ModelDeleteDialogComponent;
  let fixture: ComponentFixture<ModelDeleteDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelDeleteDialogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ModelDeleteDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('modelRelativePath', 'test-path');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
