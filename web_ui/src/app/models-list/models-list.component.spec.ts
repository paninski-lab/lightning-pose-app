import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModelsListComponent } from './models-list.component';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('ModelsListComponent', () => {
  let component: ModelsListComponent;
  let fixture: ComponentFixture<ModelsListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelsListComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
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
