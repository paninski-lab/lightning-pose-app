import { Meta, StoryObj, moduleMetadata } from '@storybook/angular';
import { VideoGroupImportComponent } from './video-group-import.component';
import { ProjectInfoService } from '../../project-info.service';

/**
 * Mock File-like object for Storybook.
 * We cast to any in the stories to satisfy the File type requirement.
 */
class MockFile {
  constructor(
    public name: string,
    public size: number = 1024 * 1024,
    public type: string = 'video/mp4',
  ) {}
}

const meta: Meta<VideoGroupImportComponent> = {
  title: 'Components/VideoGroupImport',
  component: VideoGroupImportComponent,
  decorators: [
    moduleMetadata({
      providers: [
        {
          provide: ProjectInfoService,
          useValue: {
            get projectInfo() {
              return {
                views: ['cam0', 'cam1', 'cam2'],
                data_dir: '/mock/data',
                model_dir: '/mock/model',
                keypoint_names: ['nose', 'tail'],
              };
            },
          },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<VideoGroupImportComponent>;

export const Empty: Story = {
  args: {
    files: [],
  },
};

export const MixedResults: Story = {
  args: {
    files: [
      // Complete session
      new MockFile('session1_cam0.mp4'),
      new MockFile('session1_cam1.mp4'),
      new MockFile('session1_cam2.mp4'),
      // Incomplete session (missing cam2)
      new MockFile('session2_cam0.mp4'),
      new MockFile('session2_cam1.mp4'),
      // Invalid files
      new MockFile('not_a_video.txt'),
      new MockFile('session3_unknownView.mp4'),
      new MockFile('_cam0.mp4'), // Empty session name
      new MockFile('random_file.mp4'), // No view suffix
    ] as any,
  },
};

export const SingleView: Story = {
  args: {
    isMultiview: false,
    files: [
      new MockFile('video1.mp4'),
      new MockFile('video2.avi'),
      new MockFile('experiment_results.mp4'),
      new MockFile('invalid_file.txt'),
      new MockFile('session_view.mp4'), // Should be treated as a single session in this mode
    ] as any,
  },
};

export const AllComplete: Story = {
  args: {
    files: [
      new MockFile('expA_cam0.mp4'),
      new MockFile('expA_cam1.mp4'),
      new MockFile('expA_cam2.mp4'),
      new MockFile('expB_cam0.mp4'),
      new MockFile('expB_cam1.mp4'),
      new MockFile('expB_cam2.mp4'),
    ] as any,
  },
};

export const AllIncomplete: Story = {
  args: {
    files: [
      new MockFile('test1_cam0.mp4'),
      new MockFile('test2_cam1.mp4'),
      new MockFile('test3_cam2.mp4'),
    ] as any,
  },
};
