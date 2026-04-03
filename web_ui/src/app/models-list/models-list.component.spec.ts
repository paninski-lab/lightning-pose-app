import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModelsListComponent } from './models-list.component';
import { Router } from '@angular/router';
import { of } from 'rxjs';

describe('ModelsListComponent', () => {
  let component: ModelsListComponent;
  let fixture: ComponentFixture<ModelsListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelsListComponent],
      providers: [
        {
          provide: Router,
          useValue: {
            navigate: jasmine.createSpy('navigate'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ModelsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
