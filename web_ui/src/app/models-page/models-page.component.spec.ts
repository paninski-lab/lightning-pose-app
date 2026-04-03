import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModelsPageComponent } from './models-page.component';
import { Router } from '@angular/router';
import { of } from 'rxjs';

describe('ModelsPageComponent', () => {
  let component: ModelsPageComponent;
  let fixture: ComponentFixture<ModelsPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelsPageComponent],
      providers: [
        {
          provide: Router,
          useValue: {
            navigate: jasmine.createSpy('navigate'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ModelsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
