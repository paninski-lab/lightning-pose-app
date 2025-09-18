import { Injectable, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

export interface ShowToastOptions {
  content: string;
  variant?: 'info' | 'success' | 'warning' | 'error' | 'neutral';
  durationMs?: number; // auto-dismiss after this many ms
  dismissOnClick?: boolean;
}

/** ToastService is a wrapper around DaisyUI toasts. AI-generated. */
@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private containerEl: HTMLElement | null = null;

  constructor(@Inject(DOCUMENT) private document: Document) {}

  /**
   * Preferred API: showAlert stacks multiple alerts inside one DaisyUI toast container.
   * Container: <div class="toast toast-top toast-start"></div>
   * Each call appends a sibling <div class="alert ..."><span>content</span></div>
   * Clicking an alert or its duration timer removes only that alert.
   */
  showAlert(options: ShowToastOptions) {
    const {
      content,
      variant = 'success',
      durationMs = 3000,
      dismissOnClick = true,
    } = options;

    const container = this.ensureContainer();

    // If an alert with the same content is already present, remove it first
    for (const child of Array.from(container.children)) {
      if (!(child instanceof HTMLElement)) continue;
      const span = child.querySelector('span');
      if (span && span.textContent === content) {
        container.removeChild(child);
        break; // remove only the first match
      }
    }

    // Build single alert per call
    const alertEl = this.document.createElement('div');
    alertEl.classList.add('alert');

    const variantClass = this.variantToClass(variant);
    if (variantClass) {
      alertEl.classList.add(variantClass);
    }

    alertEl.setAttribute('role', 'status');
    alertEl.setAttribute('aria-live', 'polite');

    const span = this.document.createElement('span');
    span.textContent = content;
    alertEl.appendChild(span);

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      if (alertEl.parentElement) {
        alertEl.parentElement.removeChild(alertEl);
      }
      // If container becomes empty, remove it
      this.cleanupContainerIfEmpty();
    };

    if (dismissOnClick) {
      alertEl.style.cursor = 'pointer';
      alertEl.addEventListener('click', dismiss);
    }

    container.appendChild(alertEl);

    if (durationMs > 0) {
      window.setTimeout(dismiss, durationMs);
    }
  }

  /**
   * Backward-compatible alias for existing calls.
   */
  showToast(options: ShowToastOptions) {
    this.showAlert(options);
  }

  private ensureContainer(): HTMLElement {
    if (this.containerEl && this.document.body.contains(this.containerEl)) {
      return this.containerEl;
    }
    const container = this.document.createElement('div');
    container.classList.add('toast', 'toast-bottom', 'toast-center');
    this.document.body.appendChild(container);
    this.containerEl = container;
    return container;
  }

  private cleanupContainerIfEmpty() {
    if (this.containerEl && this.containerEl.childElementCount === 0) {
      if (this.document.body.contains(this.containerEl)) {
        this.document.body.removeChild(this.containerEl);
      }
      this.containerEl = null;
    }
  }

  private variantToClass(variant: ShowToastOptions['variant']): string | null {
    switch (variant) {
      case 'info':
        return 'alert-info';
      case 'success':
        return 'alert-success';
      case 'warning':
        return 'alert-warning';
      case 'error':
        return 'alert-error';
      case 'neutral':
        return '';
      default:
        return '';
    }
  }
}
