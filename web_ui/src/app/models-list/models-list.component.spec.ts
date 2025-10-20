import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModelsListComponent } from './models-list.component';

describe('ModelsListComponent', () => {
  let component: ModelsListComponent;
  let fixture: ComponentFixture<ModelsListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelsListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModelsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
