import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { NEVER } from 'rxjs';
import { VideoImportStore } from './video-import.store';
import { SessionService } from '../session.service';
import { ProjectInfoService } from '../project-info.service';

function video(name: string): File {
  return new File(['x'], name, { type: 'video/mp4' });
}

describe('VideoImportStore', () => {
  let store: VideoImportStore;
  let session: jasmine.SpyObj<SessionService>;

  beforeEach(() => {
    session = jasmine.createSpyObj('SessionService', [
      'existsInUploads',
      'transcodeVideoSse',
      'uploadVideo',
    ]);
    session.existsInUploads.and.resolveTo(true);
    session.transcodeVideoSse.and.returnValue(NEVER);
    const projectInfo = jasmine.createSpyObj('ProjectInfoService', [
      'projectContext',
    ]);
    projectInfo.projectContext.and.returnValue({
      projectInfo: { views: ['top', 'bot'] },
    });

    TestBed.configureTestingModule({
      providers: [
        VideoImportStore,
        { provide: SessionService, useValue: session },
        { provide: ProjectInfoService, useValue: projectInfo },
      ],
    });
    store = TestBed.inject(VideoImportStore);
  });

  it('picking a video that is already listed does not add it again (#87)', () => {
    store.addFiles([video('s1_top.mp4')]);
    store.addFiles([video('s1_top.mp4'), video('s1_bot.mp4')]);

    expect(store.items().map((i) => i.name)).toEqual([
      's1_top.mp4',
      's1_bot.mp4',
    ]);
    expect(store.allValid()).toBeTrue();
  });

  it('transcodes each picked video once after picking the same videos twice', fakeAsync(() => {
    store.addFiles([video('s1_top.mp4'), video('s1_bot.mp4')]);
    store.addFiles([video('s1_top.mp4'), video('s1_bot.mp4')]);

    store.startImport();
    // startImport works through the queue without returning a promise for it.
    flushMicrotasks();
    expect(store.uploading()).toBeFalse();

    const paths = session.transcodeVideoSse.calls
      .allArgs()
      .map((args) => args[0]);
    expect(paths.sort()).toEqual([
      'uploads://s1_bot.mp4',
      'uploads://s1_top.mp4',
    ]);
  }));
});
