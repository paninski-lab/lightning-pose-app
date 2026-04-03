import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModelsPageComponent } from './models-page.component';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('ModelsPageComponent', () => {
  let component: ModelsPageComponent;
  let fixture: ComponentFixture<ModelsPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelsPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
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
