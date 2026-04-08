import type { Meta, StoryObj } from '@storybook/angular';
import { FFProbeInfoComponent } from './ffprobe-info.component';
import { FFProbeInfo } from '../../ffprobe-info';

const meta: Meta<FFProbeInfoComponent> = {
  title: 'App/VideoPlayer/FFProbeInfo',
  component: FFProbeInfoComponent,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<FFProbeInfoComponent>;

const mockData: FFProbeInfo = {
  file_path: '/path/to/video/example_video.mp4',
  duration: 125.45,
  width: 1920,
  height: 1080,
  fps: 30,
  format: 'mov,mp4,m4a,3gp,3g2,mj2',
  size: 15728640, // 15 MB
  codec: 'h264',
  is_vfr: false,
  bitrate_str: '1.0 Mbps',
  dar: '16:9',
  sar: '1:1',
  color_space: 'bt709 / bt709 / bt709',
};

export const Default: Story = {
  args: {
    data: mockData,
  },
};

export const LongPath: Story = {
  args: {
    data: {
      ...mockData,
      file_path:
        '/very/long/nested/path/to/some/deeply/located/project/directory/video_file_with_a_very_long_name_that_should_be_truncated.mp4',
    },
  },
};

export const VFRVideo: Story = {
  args: {
    data: {
      ...mockData,
      is_vfr: true,
      fps: 24,
      file_path: '/path/to/video/vfr_video.mp4',
    },
  },
};

export const LargeFile: Story = {
  args: {
    data: {
      ...mockData,
      size: 2147483648, // 2 GB
      bitrate_str: '20.5 Mbps',
      file_path: '/path/to/video/large_high_quality_video.mp4',
    },
  },
};
