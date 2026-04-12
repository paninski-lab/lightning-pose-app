import { Meta, StoryObj } from '@storybook/angular';
import { DirectoryPickerComponent } from './directory-picker.component';

const meta: Meta<DirectoryPickerComponent> = {
  title: 'Components/DirectoryPicker',
  component: DirectoryPickerComponent,
  parameters: {
    layout: 'centered',
  },
  args: {
    currentPath: '/home/user/project/data',
    directories: ['images', 'labels', 'videos', 'old_versions', 'processed'],
  },
};

export default meta;
type Story = StoryObj<DirectoryPickerComponent>;

export const Default: Story = {
  args: {},
};

export const DeepPath: Story = {
  args: {
    currentPath: '/var/log/apache2/sites-available/backup/2026/04',
    directories: ['conf', 'logs', 'meta'],
  },
};

export const Empty: Story = {
  args: {
    currentPath: '/empty/folder',
    directories: [],
  },
};

export const Root: Story = {
  args: {
    currentPath: '/',
    directories: ['bin', 'boot', 'dev', 'etc', 'home', 'lib', 'mnt', 'opt', 'proc', 'root', 'run', 'sbin', 'srv', 'sys', 'tmp', 'usr', 'var'],
  },
};
