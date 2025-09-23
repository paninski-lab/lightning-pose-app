import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExtractFramesDialogComponent } from './extract-frames-dialog.component';

describe('ExtractFramesDialogComponent', () => {
  let component: ExtractFramesDialogComponent;
  let fixture: ComponentFixture<ExtractFramesDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExtractFramesDialogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ExtractFramesDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
