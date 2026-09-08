/**
 * Review screen rendering.
 *
 * The review screen is a receipt: the count stands alone, one line says what
 * will happen to what, and aligned rows give the newest and oldest messages
 * the preview saw, whether filters may skip some, the estimate, and the
 * cutoff the run is bounded by. Everything dynamic is written with
 * `textContent`.
 */

import { formatDuration } from '../utils/helpers';
import { channelNameFromDom } from './channel-picker';
import { CSS_PREFIX } from './constants';
import type { DiscordMessage } from './ports';
import {
  describeRangePhrase,
  describeRunConfig,
  describeTarget,
  newestBoundary,
  type RunConfig,
} from './run-config';
import type { PreviewSummary } from './runner';

/** Maximum sample messages shown on the review screen. */
const MAX_SAMPLES = 5;

/** Maximum characters per sampled message. */
const MAX_SAMPLE_LENGTH = 60;

/** Value shown in a receipt row that has nothing to report yet. */
const EMPTY_VALUE = '\u2014';

/** One row of the receipt. */
interface ReceiptRow {
  readonly label: string;
  readonly value: string;
}

/**
 * Formats an instant the way the receipt states times.
 *
 * @param date - The instant to format
 * @returns Local date and time
 */
function formatLocal(date: Date): string {
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/**
 * Finds the newest and oldest instants in a preview sample.
 *
 * @param messages - Sampled messages, in whatever order the search returned
 * @returns The two ends of the sample, already formatted
 */
function sampleBounds(messages: readonly DiscordMessage[]): {
  newest: string;
  oldest: string;
} {
  const times = messages
    .map((message) => new Date(message.timestamp).getTime())
    .filter((time) => !Number.isNaN(time));
  if (times.length === 0) {
    return { newest: EMPTY_VALUE, oldest: EMPTY_VALUE };
  }
  return {
    newest: formatLocal(new Date(Math.max(...times))),
    oldest: formatLocal(new Date(Math.min(...times))),
  };
}

/** Renders the review step. */
export class ReviewView {
  private readonly root: ParentNode;
  private config: RunConfig | null = null;

  /** Resolves a channel ID to the name the picker rendered for it. */
  private readonly channelName = (id: string): string | undefined =>
    channelNameFromDom(this.root, id);

  constructor(root: ParentNode) {
    this.root = root;
  }

  /**
   * Enables or disables the confirmation button.
   *
   * @param enabled - Whether the delete button should be clickable
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

  /**
   * Sets the text of the confirmation button.
   *
   * The button itself belongs to the confirmation control, which only reads
   * this label; nothing here touches its attributes.
   *
   * @param text - Label naming the action and its count
   */
  setConfirmLabel(text: string): void {
    const slot =
      this.root.querySelector<HTMLElement>('[data-bind="confirmLabel"]') ??
      this.root.querySelector<HTMLElement>('[data-bind="confirmButton"]');
    if (slot) {
      slot.textContent = text;
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

  /** Puts the review screen into its counting state. */
  showScanning(): void {
    this.setText('reviewCount', EMPTY_VALUE);
    this.setText('reviewDetails', 'Counting messages\u2026');
    this.setConfirmLabel('Counting\u2026');
    this.renderRows(this.pendingRows());
    this.renderSamples([]);
  }

  /** Puts the review screen into its failed state. */
  showScanFailed(): void {
    this.setText('reviewCount', '?');
    this.setText('reviewDetails', 'Counting failed');
    this.setConfirmLabel('Delete messages');
    this.renderRows(this.pendingRows());
  }

  /**
   * Renders the line that says what will be deleted from where.
   *
   * @param config - The immutable config that preview and the run both use
   */
  renderSummary(config: RunConfig): void {
    this.config = config;
    const filters = describeRunConfig(config, this.channelName).find(
      (line) => line.key === 'filters',
    );
    const target = describeTarget(config, this.channelName);
    this.setText(
      'reviewCountLabel',
      `messages will be deleted from ${target}, ${describeRangePhrase(config)}${
        filters ? `, ${filters.value}` : ''
      }`,
    );
    this.renderRows(this.pendingRows());
  }

  /**
   * Renders the counts returned by a successful preview.
   *
   * A count qualified by filters is shown as "up to N", because the
   * client-side filters can only reduce what Discord's search reported.
   *
   * @param summary - Aggregated preview result
   */
  renderPreview(summary: PreviewSummary): void {
    const qualified = summary.filtersApplied
      ? `up to ${summary.totalCount}`
      : `${summary.totalCount}`;
    this.setText('reviewCount', qualified);
    this.setText(
      'reviewDetails',
      summary.channelCount > 1 ? `Across ${summary.channelCount} channels` : '',
    );
    this.setConfirmLabel(
      `Delete ${qualified} ${summary.totalCount === 1 ? 'message' : 'messages'}`,
    );

    const bounds = sampleBounds(summary.sampleMessages);
    this.renderRows([
      { label: 'Newest', value: bounds.newest },
      { label: 'Oldest', value: bounds.oldest },
      {
        label: 'Skipped by filters',
        value: summary.filtersApplied ? 'some may be skipped' : 'none',
      },
      { label: 'Estimated time', value: formatDuration(summary.estimatedTimeMs) },
      ...this.cutoffRows(),
    ]);
    this.renderSamples(summary.sampleMessages.map((message) => message.content));
  }

  /** Rows shown before a preview has any numbers to put in them. */
  private pendingRows(): ReceiptRow[] {
    return [
      { label: 'Newest', value: EMPTY_VALUE },
      { label: 'Oldest', value: EMPTY_VALUE },
      { label: 'Skipped by filters', value: EMPTY_VALUE },
      { label: 'Estimated time', value: EMPTY_VALUE },
      ...this.cutoffRows(),
    ];
  }

  /** The cutoff row, when a config has been reviewed. */
  private cutoffRows(): ReceiptRow[] {
    const config = this.config;
    if (!config?.newestAllowed) {
      return [];
    }
    return [{ label: 'Messages up to', value: formatLocal(newestBoundary(config)) }];
  }

  private renderRows(rows: readonly ReceiptRow[]): void {
    const list = this.root.querySelector<HTMLElement>('[data-bind="reviewRows"]');
    if (!list) {
      return;
    }
    list.textContent = '';
    for (const row of rows) {
      const term = document.createElement('dt');
      term.textContent = row.label;
      const detail = document.createElement('dd');
      detail.textContent = row.value;
      list.appendChild(term);
      list.appendChild(detail);
    }
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
