import { ComponentFixture, TestBed } from '@angular/core/testing';

import CreateModelDialogComponent from './create-model-dialog.component';

describe('CreateModelDialogComponent', () => {
  let component: CreateModelDialogComponent;
  let fixture: ComponentFixture<CreateModelDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateModelDialogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateModelDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
