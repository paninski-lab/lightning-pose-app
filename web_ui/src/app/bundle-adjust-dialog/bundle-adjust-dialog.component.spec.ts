import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BundleAdjustDialogComponent } from './bundle-adjust-dialog.component';

describe('BundleAdjustDialogComponent', () => {
  let component: BundleAdjustDialogComponent;
  let fixture: ComponentFixture<BundleAdjustDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BundleAdjustDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BundleAdjustDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
