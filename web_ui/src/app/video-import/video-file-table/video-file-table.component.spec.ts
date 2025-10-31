import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VideoFileTableComponent } from './video-file-table.component';

describe('VideoFileTableComponent', () => {
  let component: VideoFileTableComponent;
  let fixture: ComponentFixture<VideoFileTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VideoFileTableComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VideoFileTableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
