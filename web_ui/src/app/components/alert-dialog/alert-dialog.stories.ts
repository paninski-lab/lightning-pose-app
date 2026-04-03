import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import {
  AlertDialogComponent,
  AlertHeaderComponent,
  AlertFooterComponent,
} from './alert-dialog.component';
import { fn } from 'storybook/test';

const meta: Meta<AlertDialogComponent> = {
  title: 'Components/AlertDialog',
  component: AlertDialogComponent,
  tags: ['autodocs'],
  decorators: [
    moduleMetadata({
      imports: [AlertHeaderComponent, AlertFooterComponent],
    }),
  ],
  argTypes: {
    close: { action: 'close' },
  },
  args: {
    close: fn(),
  },
};

export default meta;
type Story = StoryObj<AlertDialogComponent>;

export const Default: Story = {
  render: (args) => ({
    props: args,
    template: `
      <app-alert-dialog (close)="close()">
        <app-alert-header>Alert Title</app-alert-header>
        <p>This is the main content of the alert dialog. You can put any HTML content here.</p>
        <app-alert-footer>
          <button class="btn" (click)="close()">Cancel</button>
          <button class="btn btn-primary" (click)="close()">Confirm</button>
        </app-alert-footer>
      </app-alert-dialog>
    `,
  }),
};

export const LongContent: Story = {
  render: (args) => ({
    props: args,
    template: `
      <app-alert-dialog (close)="close()">
        <app-alert-header>Terms and Conditions</app-alert-header>
        <div class="space-y-4">
          <p>This is a long text to test the scroll behavior and how the dialog handles large amounts of content.</p>
          <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
          <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.</p>
          <p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>
          <p>Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.</p>
        </div>
        <app-alert-footer>
          <button class="btn btn-primary" (click)="close()">Accept</button>
        </app-alert-footer>
      </app-alert-dialog>
    `,
  }),
};
