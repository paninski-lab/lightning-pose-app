import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { HomePageComponent } from './home-page.component';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ListProjectItem, ProjectInfoService } from '../project-info.service';

const projects: ListProjectItem[] = [
  {
    project_key: 'mouse',
    data_dir: '/data/mouse',
    model_dir: '/models/mouse',
    stats: {
      session_count: 3,
      label_file_count: 1,
      label_files_stats: [
        { name: 'CollectedData.csv', labeled_frames: 7, total_frames: 9 },
      ],
      labeled_frames_count: 7,
      keypoint_names: ['nose', 'tail'],
      view_names: ['top', 'side'],
      model_count: 2,
    },
  },
  {
    project_key: 'broken',
    data_dir: '/data/broken',
    model_dir: null,
    stats: {
      session_count: 0,
      label_file_count: 0,
      label_files_stats: [],
      keypoint_names: [],
      view_names: [],
      model_count: 0,
      error: 'could not read project.yaml',
    },
  },
];

describe('HomePageComponent', () => {
  let fixture: ComponentFixture<HomePageComponent>;
  let el: HTMLElement;

  function setUp() {
    TestBed.configureTestingModule({
      imports: [HomePageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ProjectInfoService,
          useValue: {
            projects: signal(projects),
            fetchProjects: jasmine.createSpy('fetchProjects'),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(HomePageComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  function toggle(): HTMLInputElement {
    const label = Array.from(el.querySelectorAll('label')).find((l) =>
      l.textContent?.includes('Show details'),
    );
    return label!.querySelector('input[type="checkbox"]') as HTMLInputElement;
  }

  function card(key: string): HTMLElement {
    return el.querySelector(`a[aria-label="Open project ${key}"]`)!;
  }

  function statTitles(key: string): string[] {
    return Array.from(card(key).querySelectorAll('.stat-title')).map((t) =>
      t.textContent!.trim(),
    );
  }

  beforeEach(() => localStorage.removeItem('showProjectDetails'));
  afterEach(() => localStorage.removeItem('showProjectDetails'));

  it('shows details by default', () => {
    setUp();
    expect(toggle().checked).toBeTrue();
    const text = card('mouse').textContent!;
    expect(text).toContain('/data/mouse');
    expect(text).toContain('/models/mouse');
    expect(text).toContain('nose');
    expect(text).toContain('top');
    expect(text).toContain('Labeling Progress');
    expect(statTitles('mouse')).toEqual(['Sessions', 'Labels', 'Models']);
  });

  it('turning details off leaves only the name and stats row, and is remembered', () => {
    setUp();
    toggle().click();
    fixture.detectChanges();

    expect(toggle().checked).toBeFalse();
    const mouse = card('mouse');
    expect(mouse.querySelector('h2')!.textContent!.trim()).toBe('mouse');
    expect(statTitles('mouse')).toEqual(['Sessions', 'Labels', 'Models']);
    const text = mouse.textContent!;
    expect(text).not.toContain('/data/mouse');
    expect(text).not.toContain('/models/mouse');
    expect(text).not.toContain('Views');
    expect(text).not.toContain('Keypoints');
    expect(text).not.toContain('nose');
    expect(text).not.toContain('Labeling Progress');
    expect(localStorage.getItem('showProjectDetails')).toBe('false');
  });

  it('starts with details off when it was turned off before', () => {
    localStorage.setItem('showProjectDetails', 'false');
    setUp();
    expect(toggle().checked).toBeFalse();
    expect(card('mouse').textContent).not.toContain('/data/mouse');
  });

  it('keeps the stats error and the options menu with details off', () => {
    localStorage.setItem('showProjectDetails', 'false');
    setUp();
    expect(card('broken').textContent).toContain(
      'Error: could not read project.yaml',
    );
    expect(
      el.querySelectorAll('button[aria-label="Project options"]').length,
    ).toBe(2);
  });
});
