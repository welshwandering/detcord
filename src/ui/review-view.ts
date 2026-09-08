/**
 * Review screen rendering.
 *
 * Draws the summary of the immutable {@link RunConfig}, the sampled messages
 * and the inline validation messages, and owns the enabled state of the
 * "Begin Sweep" button. Everything dynamic is written with `textContent`.
 */

import { formatDuration } from '../utils/helpers';
import { CSS_PREFIX } from './constants';
import { describeRunConfig, type RunConfig } from './run-config';
import type { PreviewSummary } from './runner';

/** Maximum sample messages shown on the review screen. */
const MAX_SAMPLES = 5;

/** Maximum characters per sampled message. */
const MAX_SAMPLE_LENGTH = 60;

/** Renders the review step. */
export class ReviewView {
  private readonly root: ParentNode;

  constructor(root: ParentNode) {
    this.root = root;
  }

  /**
   * Enables or disables the confirmation button.
   *
   * @param enabled - Whether "Begin Sweep" should be clickable
   */
  setConfirmEnabled(enabled: boolean): void {
    const button = this.root.querySelector<HTMLButtonElement>('[data-bind="confirmButton"]');
    if (!button) {
      return;
    }
    if (enabled) {
      button.removeAttribute('disabled');
    } else {
      button.setAttribute('disabled', 'disabled');
    }
  }

  /** Clears every inline validation message. */
  clearErrors(): void {
    for (const el of this.root.querySelectorAll(`.${CSS_PREFIX}-inline-error`)) {
      el.textContent = '';
      el.classList.remove('visible');
    }
  }

  /**
   * Shows an inline validation message.
   *
   * @param binding - `data-bind` name of the error slot
   * @param message - Text to show
   */
  showError(binding: string, message: string): void {
    const el = this.root.querySelector<HTMLElement>(`[data-bind="${binding}"]`);
    if (el) {
      el.textContent = message;
      el.classList.add('visible');
    }
  }

  /** Puts the review screen into its scanning state. */
  showScanning(): void {
    this.setText('reviewCount', '...');
    this.setText('reviewDetails', 'Scanning...');
  }

  /** Puts the review screen into its failed state. */
  showScanFailed(): void {
    this.setText('reviewCount', '?');
    this.setText('reviewDetails', 'Scan failed');
  }

  /**
   * Renders the label/value summary of the config being reviewed.
   *
   * @param config - The immutable config that preview and the run both use
   */
  renderSummary(config: RunConfig): void {
    const list = this.root.querySelector<HTMLElement>('[data-bind="reviewSummary"]');
    if (!list) {
      return;
    }
    list.textContent = '';
    for (const line of describeRunConfig(config)) {
      const term = document.createElement('dt');
      term.textContent = line.label;
      const detail = document.createElement('dd');
      detail.textContent = line.value;
      list.appendChild(term);
      list.appendChild(detail);
    }
  }

  /**
   * Renders the counts returned by a successful preview.
   *
   * A count qualified by filters is shown as "up to N", because the client-side
   * filters can only reduce what Discord's search reported.
   *
   * @param summary - Aggregated preview result
   */
  renderPreview(summary: PreviewSummary): void {
    const prefix = summary.filtersApplied ? 'up to ' : '';
    this.setText('reviewCount', `${prefix}${summary.totalCount}`);
    this.setText(
      'reviewDetails',
      summary.channelCount > 1
        ? `Across ${summary.channelCount} channels \u00B7 about ${formatDuration(summary.estimatedTimeMs)}`
        : `About ${formatDuration(summary.estimatedTimeMs)}`,
    );
    this.renderSamples(summary.sampleMessages.map((message) => message.content));
  }

  private renderSamples(contents: string[]): void {
    const container = this.root.querySelector<HTMLElement>('[data-bind="previewContent"]');
    if (!container) {
      return;
    }
    container.textContent = '';
    const shown = contents.slice(0, MAX_SAMPLES);
    if (shown.length === 0) {
      container.appendChild(this.sampleElement('No messages found'));
      return;
    }
    for (const content of shown) {
      const text = content || '[No text content]';
      container.appendChild(
        this.sampleElement(
          text.length > MAX_SAMPLE_LENGTH ? `${text.slice(0, MAX_SAMPLE_LENGTH)}...` : text,
        ),
      );
    }
  }

  private sampleElement(text: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `${CSS_PREFIX}-preview-msg`;
    el.textContent = text;
    return el;
  }

  private setText(binding: string, value: string): void {
    const el = this.root.querySelector<HTMLElement>(`[data-bind="${binding}"]`);
    if (el) {
      el.textContent = value;
    }
  }
}
