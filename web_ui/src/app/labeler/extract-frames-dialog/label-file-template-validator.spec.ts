import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { LabelFileTemplateValidatorDirective } from './extract-frames-dialog.component';
import { ProjectInfoService } from '../../project-info.service';

describe('New label file name check (Extract Frames)', () => {
  function errorsFor(views: string[], name: string) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ProjectInfoService, useValue: { allViews: signal(views) } },
      ],
    });
    const validator = TestBed.runInInjectionContext(
      () => new LabelFileTemplateValidatorDirective(),
    );
    return validator.validate(new FormControl(name));
  }

  it('asks for a * in a project with one named view', () => {
    expect(errorsFor(['cam'], 'CollectedData')).toEqual(
      jasmine.objectContaining({ viewStarMissing: true }),
    );
    expect(errorsFor(['cam'], 'CollectedData_*')).toBeNull();
  });

  it('does not ask for a * in a single-view project', () => {
    expect(errorsFor([], 'CollectedData')).toBeNull();
  });
});
