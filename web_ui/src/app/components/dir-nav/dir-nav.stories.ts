import { Meta, StoryObj } from '@storybook/angular';
import { DirNavComponent } from './dir-nav.component';

const meta: Meta<DirNavComponent> = {
  title: 'Components/DirNav',
  component: DirNavComponent,
  parameters: {
    layout: 'centered',
  },
  args: {
    currentPath: '/home/user/project/data',
    directories: ['images', 'labels', 'videos', 'old_versions', 'processed'],
    showCancel: true,
  },
};

export default meta;
type Story = StoryObj<DirNavComponent>;

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

export const NoCancel: Story = {
  args: {
    showCancel: false,
    currentPath: '/home/user/models',
    directories: ['checkpoint_1', 'checkpoint_2', 'final'],
  },
};
