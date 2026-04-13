import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModelDetailComponent } from './model-detail.component';
import { ProjectInfoService } from '../../project-info.service';

describe('ModelDetailComponent', () => {
  let component: ModelDetailComponent;
  let fixture: ComponentFixture<ModelDetailComponent>;
  let mockProjectInfoService: jasmine.SpyObj<ProjectInfoService>;

  beforeEach(async () => {
    mockProjectInfoService = jasmine.createSpyObj('ProjectInfoService', [], {
      projectInfo: { model_dir: '/mock/model/dir' },
    });

    await TestBed.configureTestingModule({
      imports: [ModelDetailComponent],
      providers: [
        { provide: ProjectInfoService, useValue: mockProjectInfoService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ModelDetailComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('selectedModel', null);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show TensorBoard instructions when activeTab is "tensorboard"', () => {
    component.activeTab.set('tensorboard');
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('TensorBoard Instructions');
    expect(compiled.textContent).toContain(
      'tensorboard --logdir /mock/model/dir',
    );
    expect(compiled.textContent).toContain('Note for cloud users');
  });

  it('should show ensemble warning in TensorBoard tab for eks models', () => {
    fixture.componentRef.setInput('selectedModel', { model_kind: 'eks' });
    component.activeTab.set('tensorboard');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Note: This is an ensemble model');
    const alert = compiled.querySelector('.alert.alert-warning');
    expect(alert).toBeTruthy();
  });

  it('should show model path, type, and absolute directory in the header', () => {
    fixture.componentRef.setInput('selectedModel', {
      model_relative_path: 'test/model',
      model_kind: 'normal',
      config: {
        model: {
          model_type: 'mhcrnn',
          losses_to_use: [],
        },
      },
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    // test / model because of PathPipe
    expect(compiled.textContent).toContain('test / model');
    // Supervised Context because of modelType pipe and mc_util logic
    expect(compiled.textContent).toContain('Supervised Context');
    // Absolute path in app-path-display
    const pathDisplay = compiled.querySelector('app-path-display');
    expect(pathDisplay).toBeTruthy();
    expect(pathDisplay?.textContent).toContain('/mock/model/dir/test/model');
  });

  it('should show Config tab by default and display YAML content', () => {
    fixture.componentRef.setInput('selectedModel', {
      model_relative_path: 'test/model',
      model_kind: 'normal',
      config: {
        model: {
          model_name: 'test-model',
          model_type: 'regression',
          losses_to_use: [],
        },
      },
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(component.activeTab()).toBe('config');
    const tab = compiled.querySelector('.tab-active');
    expect(tab?.textContent).toContain('Config');

    expect(compiled.textContent).toContain('config.yaml:');
    expect(compiled.textContent).toContain('/mock/model/dir/test/model/config.yaml');

    const pre = compiled.querySelector('pre.text-xs');
    expect(pre).toBeTruthy();
    expect(pre?.textContent).toContain('model_name: test-model');
  });

  it('should show ensemble_config and ensemble.yaml in Config tab for eks models', () => {
    fixture.componentRef.setInput('selectedModel', {
      model_relative_path: 'test/eks',
      model_kind: 'eks',
      ensemble_config: {
        smooth_param: 0.5,
      },
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('ensemble.yaml:');
    expect(compiled.textContent).toContain('/mock/model/dir/test/eks/ensemble.yaml');

    const pre = compiled.querySelector('pre.text-xs');
    expect(pre?.textContent).toContain('smooth_param: 0.5');
  });
});
