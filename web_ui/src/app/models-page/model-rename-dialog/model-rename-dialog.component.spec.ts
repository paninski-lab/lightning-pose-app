import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModelRenameDialogComponent } from './model-rename-dialog.component';

describe('ModelRenameDialogComponent', () => {
  let component: ModelRenameDialogComponent;
  let fixture: ComponentFixture<ModelRenameDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelRenameDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModelRenameDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
