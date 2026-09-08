/**
 * Progress and completion view.
 *
 * Renders the running screen as one instrument - a status line, a large count,
 * a thin bar, three small figures and a plain log - and the completion screen
 * as a receipt. Everything dynamic is written with `textContent`, so message
 * content and error text can never be interpreted as markup.
 */

import { formatDuration } from '../utils/helpers';
import {
  createBoundedArray,
  type ThrottledFunction,
  throttle,
  trimChildren,
} from '../utils/performance';
import { CSS_PREFIX, MAX_PREVIEW_LENGTH } from './constants';
import type { MessageOutcome } from './ports';
import type { ChannelPosition, RunProgress, RunSummary } from './runner';

/** One rendered line of the live feed. */
export interface FeedEntry {
  messageId: string;
  content: string;
  status: MessageOutcome['status'];
  reason?: string | undefined;
  /** When the message was processed; defaults to now. */
  at?: number | undefined;
}

/** Tuning knobs, mirrored from the controller options. */
export interface ProgressViewOptions {
  maxFeedEntries: number;
  progressThrottleMs: number;
  feedThrottleMs: number;
}

/** One row of the completion receipt. */
export interface ReceiptRow {
  label: string;
  value: string;
}

interface ProgressElements {
  bar: HTMLElement | null;
  count: HTMLElement | null;
  status: HTMLElement | null;
  deleted: HTMLElement | null;
  failed: HTMLElement | null;
  skipped: HTMLElement | null;
  alreadyGone: HTMLElement | null;
  alreadyGoneFigure: HTMLElement | null;
  eta: HTMLElement | null;
  elapsed: HTMLElement | null;
  channelProgress: HTMLElement | null;
  feed: HTMLElement | null;
}

const FEED_LABELS: Record<MessageOutcome['status'], string> = {
  deleted: 'deleted',
  already_gone: 'already gone',
  skipped: 'skipped',
  failed: 'failed',
};

/** Shown while the engine is deleting and has nothing more specific to say. */
const DEFAULT_STATUS = 'Deleting…';

/** Ellipsis appended to a truncated message body. */
const ELLIPSIS = '…';

/**
 * Titles a finished run by what actually happened to the messages.
 *
 * A completed run that left failures or skips behind is not a clean sweep and
 * must not be announced as one.
 *
 * @param summary - How the run ended
 * @returns The heading for the completion screen
 */
export function completionTitle(summary: RunSummary): string {
  if (summary.reason === 'error') {
    return 'Stopped by an error';
  }
  if (summary.reason === 'stopped') {
    return `Stopped after ${summary.deleted}`;
  }
  if (summary.failed > 0) {
    return `${summary.failed} could not be deleted`;
  }
  if (summary.skipped > 0) {
    return `Finished, ${summary.skipped} skipped`;
  }
  return `${summary.deleted} deleted`;
}

/**
 * Lists every outcome of a finished run as receipt rows.
 *
 * @param summary - How the run ended
 * @returns Label and value pairs, in reading order
 */
export function completionReceipt(summary: RunSummary): ReceiptRow[] {
  const rows: ReceiptRow[] = [{ label: 'Deleted', value: String(summary.deleted) }];
  if (summary.alreadyGone > 0) {
    rows.push({ label: 'Already gone', value: String(summary.alreadyGone) });
  }
  rows.push(
    { label: 'Skipped', value: String(summary.skipped) },
    { label: 'Failed', value: String(summary.failed) },
    { label: 'Duration', value: formatDuration(summary.durationMs) },
  );
  if (summary.channelCount > 1) {
    rows.push({
      label: 'Channels',
      value: `${summary.channelsCompleted} of ${summary.channelCount}`,
    });
  }
  return rows;
}

/**
 * Names the wait the engine is currently serving.
 *
 * @param delayMs - Delay between deletions in ms
 * @returns A status line stating what is being waited on
 */
export function rateLimitStatus(delayMs: number): string {
  return `Waiting ${Math.max(1, Math.round(delayMs / 1000))} s for Discord's rate limit`;
}

/** Renders deletion progress into the running and completion screens. */
export class ProgressView {
  private root: ParentNode | null = null;
  private elements: ProgressElements | null = null;
  private readonly options: ProgressViewOptions;
  private readonly feedEntries: ReturnType<typeof createBoundedArray<FeedEntry>>;
  private readonly throttledRender: ThrottledFunction<(progress: RunProgress) => void>;
  private readonly throttledFeedFlush: ThrottledFunction<() => void>;
  private pendingFeed: FeedEntry[] = [];
  private percent = 0;
  private miniIndicator: HTMLElement | null = null;
  private engineStatus: string | undefined;
  private throttleStatus: string | undefined;
  private paused = false;

  constructor(options: ProgressViewOptions) {
    this.options = options;
    this.feedEntries = createBoundedArray<FeedEntry>(options.maxFeedEntries);
    this.throttledRender = throttle(
      (progress: RunProgress) => this.render(progress),
      options.progressThrottleMs,
    );
    this.throttledFeedFlush = throttle(() => this.flushFeed(), options.feedThrottleMs);
  }

  /**
   * Binds the view to the window markup.
   *
   * @param root - Element containing the running and completion screens
   */
  attach(root: ParentNode): void {
    this.root = root;
    this.elements = {
      bar: root.querySelector('[data-bind="progressBar"]'),
      count: root.querySelector('[data-bind="progressCount"]'),
      status: root.querySelector('[data-bind="statusMessage"]'),
      deleted: root.querySelector('[data-bind="deletedCount"]'),
      failed: root.querySelector('[data-bind="failedCount"]'),
      skipped: root.querySelector('[data-bind="skippedCount"]'),
      alreadyGone: root.querySelector('[data-bind="alreadyGone"]'),
      alreadyGoneFigure: root.querySelector('[data-bind="alreadyGoneFigure"]'),
      eta: root.querySelector('[data-bind="eta"]'),
      elapsed: root.querySelector('[data-bind="elapsedTime"]'),
      channelProgress: root.querySelector('[data-bind="channelProgress"]'),
      feed: root.querySelector('[data-bind="feed"]'),
    };
  }

  /** Registers the minimised indicator so its count can be kept in step. */
  setMiniIndicator(element: HTMLElement | null): void {
    this.miniIndicator = element;
  }

  /** Clears counters, feed and any leftover wait notice. */
  reset(): void {
    this.throttledRender.cancel();
    this.throttledFeedFlush.cancel();
    this.feedEntries.clear();
    this.pendingFeed = [];
    this.percent = 0;
    this.engineStatus = undefined;
    this.throttleStatus = undefined;
    this.paused = false;

    const els = this.elements;
    if (!els) {
      return;
    }
    if (els.feed) {
      els.feed.textContent = '';
    }
    this.setText(els.count, '0 of 0');
    this.setText(els.deleted, '0');
    this.setText(els.failed, '0');
    this.setText(els.skipped, '0');
    this.setText(els.alreadyGone, '0');
    this.setText(els.eta, '--:--');
    this.setText(els.elapsed, '0s');
    this.setText(els.channelProgress, '');
    if (els.bar) {
      els.bar.style.width = '0%';
    }
    els.alreadyGoneFigure?.classList.add(`${CSS_PREFIX}-run-figure-hidden`);
    this.renderStatus();
  }

  /**
   * Announces which channel of a multi-channel run is starting.
   *
   * @param position - Channel index and total
   */
  setChannelPosition(position: ChannelPosition): void {
    if (!this.elements?.channelProgress) {
      return;
    }
    this.elements.channelProgress.textContent =
      position.count > 1 ? `Channel ${position.index} of ${position.count}` : '';
  }

  /**
   * Records a processed message and schedules a throttled repaint.
   *
   * @param progress - Aggregated run progress
   * @param messageId - Message ID
   * @param content - Message content
   * @param outcome - What happened to that message
   */
  push(progress: RunProgress, messageId: string, content: string, outcome: MessageOutcome): void {
    const entry: FeedEntry = {
      messageId,
      content,
      status: outcome.status,
      reason: outcome.reason,
      at: Date.now(),
    };
    this.feedEntries.push(entry);
    this.pendingFeed.push(entry);
    this.throttledFeedFlush();
    this.throttledRender(progress);
  }

  /**
   * Shows or clears the engine's own status line.
   *
   * @param status - Status text, or undefined to fall back to the default
   */
  setStatus(status: string | undefined): void {
    this.engineStatus = status;
    this.renderStatus();
  }

  /**
   * Records whether the run is paused, which the status line reports.
   *
   * @param paused - Whether the engine is paused
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.renderStatus();
  }

  /**
   * Shows or clears the rate-limit wait in the status line.
   *
   * @param isThrottled - Whether the engine is currently throttled
   * @param currentDelay - Delay between deletes in ms
   */
  setThrottleState(isThrottled: boolean, currentDelay: number): void {
    this.throttleStatus = isThrottled ? rateLimitStatus(currentDelay) : undefined;
    this.renderStatus();
  }

  /** Flushes any throttled work so the final numbers are on screen. */
  flush(progress: RunProgress | null): void {
    this.throttledRender.cancel();
    this.throttledFeedFlush.cancel();
    if (progress) {
      this.render(progress);
    }
    this.flushFeed();
  }

  /**
   * Renders the completion screen for a finished run.
   *
   * @param summary - How the run ended
   */
  showCompletion(summary: RunSummary): void {
    const root = this.root;
    if (!root) {
      return;
    }
    this.setBoundText(root, 'completeTitle', completionTitle(summary));
    this.renderReceipt(root, completionReceipt(summary));

    const detail = root.querySelector<HTMLElement>('[data-bind="completeDetail"]');
    if (detail) {
      const message = summary.reason === 'error' ? (summary.error?.message ?? 'Unknown error') : '';
      detail.textContent = message;
      detail.style.display = message ? 'block' : 'none';
    }

    // A run that did not finish leaves a checkpoint behind to resume from.
    const note = root.querySelector<HTMLElement>('[data-bind="completeResumeNote"]');
    if (note) {
      note.style.display = summary.reason === 'completed' ? 'none' : 'block';
    }
  }

  /** Current progress percentage, used by the bar and the minimised pill. */
  getPercent(): number {
    return this.percent;
  }

  /** Cancels pending throttled work. */
  dispose(): void {
    this.throttledRender.cancel();
    this.throttledFeedFlush.cancel();
    this.pendingFeed = [];
    this.feedEntries.clear();
    this.elements = null;
    this.root = null;
    this.miniIndicator = null;
  }

  // =========================================================================
  // Rendering
  // =========================================================================

  private render(progress: RunProgress): void {
    const els = this.elements;
    if (!els) {
      return;
    }
    const { state, stats, totals } = progress;
    const processed = totals.deleted + totals.failed + totals.skipped + totals.alreadyGone;
    const total = Math.max(state.initialTotalFound || state.totalFound || processed, 1);
    this.percent = Math.min(100, Math.round((processed / total) * 100));

    this.setText(els.count, `${processed} of ${total}`);
    if (els.bar) {
      els.bar.style.width = `${this.percent}%`;
    }
    this.setText(els.deleted, String(totals.deleted));
    this.setText(els.failed, String(totals.failed));
    this.setText(els.skipped, String(totals.skipped));
    this.renderAlreadyGone(els, totals.alreadyGone);
    this.renderTimes(els, stats);
    this.renderMini(processed, total);
  }

  private renderAlreadyGone(els: ProgressElements, alreadyGone: number): void {
    this.setText(els.alreadyGone, String(alreadyGone));
    els.alreadyGoneFigure?.classList.toggle(`${CSS_PREFIX}-run-figure-hidden`, alreadyGone === 0);
  }

  private renderStatus(): void {
    const el = this.elements?.status;
    if (!el) {
      return;
    }
    if (this.paused) {
      el.textContent = 'Paused';
      return;
    }
    el.textContent = this.throttleStatus ?? this.engineStatus ?? DEFAULT_STATUS;
  }

  private renderTimes(
    els: ProgressElements,
    stats: { startTime: number; estimatedTimeRemaining: number },
  ): void {
    const elapsed = stats.startTime > 0 ? Date.now() - stats.startTime : 0;
    this.setText(els.elapsed, formatDuration(elapsed));
    this.setText(
      els.eta,
      stats.estimatedTimeRemaining > 0 ? formatDuration(stats.estimatedTimeRemaining) : '--:--',
    );
  }

  private renderMini(processed: number, total: number): void {
    const countEl = this.miniIndicator?.querySelector<HTMLElement>('[data-bind="miniCount"]');
    if (countEl) {
      countEl.textContent = `${processed} / ${total}`;
    }
  }

  private renderReceipt(root: ParentNode, rows: ReceiptRow[]): void {
    const container = root.querySelector<HTMLElement>('[data-bind="completeReceipt"]');
    if (!container) {
      return;
    }
    container.textContent = '';
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      fragment.appendChild(createReceiptRow(row));
    }
    container.appendChild(fragment);
  }

  private flushFeed(): void {
    const feedEl = this.elements?.feed;
    if (!feedEl || this.pendingFeed.length === 0) {
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const entry of this.pendingFeed) {
      fragment.appendChild(createFeedElement(entry));
    }
    feedEl.appendChild(fragment);
    trimChildren(feedEl, this.options.maxFeedEntries, false);
    feedEl.scrollTop = feedEl.scrollHeight;
    this.pendingFeed = [];
  }

  private setText(el: HTMLElement | null, value: string): void {
    if (el) {
      el.textContent = value;
    }
  }

  private setBoundText(root: ParentNode, binding: string, value: string): void {
    const el = root.querySelector<HTMLElement>(`[data-bind="${binding}"]`);
    if (el) {
      el.textContent = value;
    }
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}${ELLIPSIS}` : value;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Formats a log row's time column.
 *
 * @param at - Epoch milliseconds
 * @returns The local time as HH:MM:SS
 */
export function formatLogTime(at: number): string {
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * Names an outcome for the log, with its reason when there is one.
 *
 * @param entry - The processed message
 * @returns Words such as "deleted" or "skipped \u00B7 pinned"
 */
export function feedOutcomeLabel(entry: FeedEntry): string {
  const label = FEED_LABELS[entry.status];
  return entry.reason ? `${label} \u00B7 ${entry.reason}` : label;
}

/**
 * Builds one row of the completion receipt.
 *
 * @param row - Label and value
 * @returns A row element on the receipt grid
 */
export function createReceiptRow(row: ReceiptRow): HTMLElement {
  const el = document.createElement('div');
  el.className = `${CSS_PREFIX}-receipt-row`;
  const label = document.createElement('span');
  label.className = `${CSS_PREFIX}-receipt-label`;
  label.textContent = row.label;
  const value = document.createElement('span');
  value.className = `${CSS_PREFIX}-receipt-value`;
  value.textContent = row.value;
  el.appendChild(label);
  el.appendChild(value);
  return el;
}

/**
 * Builds one live-log row: time, outcome, then the message text.
 *
 * @param entry - The processed message
 * @returns A row element describing the outcome
 */
export function createFeedElement(entry: FeedEntry): HTMLElement {
  const el = document.createElement('div');
  el.className = `${CSS_PREFIX}-feed-entry ${CSS_PREFIX}-log-row ${CSS_PREFIX}-feed-${entry.status.replace('_', '-')}`;

  const time = document.createElement('span');
  time.className = `${CSS_PREFIX}-log-time`;
  time.textContent = formatLogTime(entry.at ?? Date.now());

  const outcome = document.createElement('span');
  outcome.className = `${CSS_PREFIX}-log-outcome`;
  outcome.textContent = feedOutcomeLabel(entry);

  const text = document.createElement('span');
  text.className = `${CSS_PREFIX}-log-text`;
  text.textContent = truncate(entry.content || '[No content]', MAX_PREVIEW_LENGTH);

  el.appendChild(time);
  el.appendChild(outcome);
  el.appendChild(text);
  return el;
}
