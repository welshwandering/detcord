/**
 * Progress and completion view.
 *
 * Renders the running screen (ring, counters, live feed, throttle notice) and
 * the completion screen. Everything dynamic is written with `textContent`, so
 * message content and error text can never be interpreted as markup.
 */

import { formatDuration } from '../utils/helpers';
import {
  createBoundedArray,
  type ThrottledFunction,
  throttle,
  trimChildren,
} from '../utils/performance';
import {
  CSS_PREFIX,
  MAX_PREVIEW_LENGTH,
  MINI_RING_RADIUS,
  PROGRESS_RING_RADIUS,
} from './constants';
import { createConfetti } from './effects';
import type { MessageOutcome } from './ports';
import type { ChannelPosition, RunProgress, RunSummary } from './runner';

/** One rendered line of the live feed. */
export interface FeedEntry {
  messageId: string;
  content: string;
  status: MessageOutcome['status'];
  reason?: string | undefined;
}

/** Tuning knobs, mirrored from the controller options. */
export interface ProgressViewOptions {
  maxFeedEntries: number;
  progressThrottleMs: number;
  feedThrottleMs: number;
}

interface ProgressElements {
  ring: SVGCircleElement | null;
  bar: HTMLElement | null;
  percent: HTMLElement | null;
  count: HTMLElement | null;
  deleted: HTMLElement | null;
  failed: HTMLElement | null;
  skipped: HTMLElement | null;
  rate: HTMLElement | null;
  eta: HTMLElement | null;
  elapsed: HTMLElement | null;
  currentMessage: HTMLElement | null;
  channelProgress: HTMLElement | null;
  throttleInfo: HTMLElement | null;
  throttleCount: HTMLElement | null;
  feed: HTMLElement | null;
}

const FEED_LABELS: Record<MessageOutcome['status'], string> = {
  deleted: 'deleted',
  already_gone: 'already gone',
  skipped: 'skipped',
  failed: 'failed',
};

const COMPLETION_TITLES: Record<RunSummary['reason'], string> = {
  completed: 'All clean!',
  stopped: 'Stopped by you',
  error: 'Stopped by an error',
};

const COMPLETION_ICONS: Record<RunSummary['reason'], string> = {
  completed: '\u2728',
  stopped: '\u270B',
  error: '\u26A0\uFE0F',
};

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
      ring: root.querySelector('[data-bind="progressRing"]'),
      bar: root.querySelector('[data-bind="progressBar"]'),
      percent: root.querySelector('[data-bind="progressPercent"]'),
      count: root.querySelector('[data-bind="progressCount"]'),
      deleted: root.querySelector('[data-bind="deletedCount"]'),
      failed: root.querySelector('[data-bind="failedCount"]'),
      skipped: root.querySelector('[data-bind="skippedCount"]'),
      rate: root.querySelector('[data-bind="rateValue"]'),
      eta: root.querySelector('[data-bind="eta"]'),
      elapsed: root.querySelector('[data-bind="elapsedTime"]'),
      currentMessage: root.querySelector('[data-bind="currentMessage"]'),
      channelProgress: root.querySelector('[data-bind="channelProgress"]'),
      throttleInfo: root.querySelector('[data-bind="throttleInfo"]'),
      throttleCount: root.querySelector('[data-bind="throttleCount"]'),
      feed: root.querySelector('[data-bind="feed"]'),
    };
  }

  /** Registers the minimised indicator so its ring can be kept in step. */
  setMiniIndicator(element: HTMLElement | null): void {
    this.miniIndicator = element;
  }

  /** Clears counters, feed and any leftover throttle notice. */
  reset(): void {
    this.throttledRender.cancel();
    this.throttledFeedFlush.cancel();
    this.feedEntries.clear();
    this.pendingFeed = [];
    this.percent = 0;

    const els = this.elements;
    if (!els) {
      return;
    }
    if (els.feed) {
      els.feed.textContent = '';
    }
    this.setText(els.percent, '0%');
    this.setText(els.count, '0 / 0');
    this.setText(els.deleted, '0');
    this.setText(els.failed, '0');
    this.setText(els.skipped, '0');
    this.setText(els.rate, '0');
    this.setText(els.eta, '--:--');
    this.setText(els.elapsed, '0s');
    this.setText(els.currentMessage, 'Starting...');
    this.setText(els.channelProgress, '');
    if (els.throttleInfo) {
      els.throttleInfo.style.display = 'none';
    }
    this.root?.querySelector(`[data-screen="running"] .${CSS_PREFIX}-waiting`)?.remove();
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
   * @param content - Message content
   * @param messageId - Message ID
   * @param outcome - What happened to that message
   */
  push(progress: RunProgress, messageId: string, content: string, outcome: MessageOutcome): void {
    const entry: FeedEntry = {
      messageId,
      content,
      status: outcome.status,
      reason: outcome.reason,
    };
    this.feedEntries.push(entry);
    this.pendingFeed.push(entry);
    this.throttledFeedFlush();
    this.setText(
      this.elements?.currentMessage ?? null,
      truncate(content || '[No text content]', 50),
    );
    this.throttledRender(progress);
  }

  /**
   * Shows or clears the engine's status line (e.g. "Finding oldest message").
   *
   * @param status - Status text, or undefined to clear
   */
  setStatus(status: string | undefined): void {
    const el = this.elements?.currentMessage;
    if (!el) {
      return;
    }
    if (status) {
      el.textContent = status;
      el.classList.add(`${CSS_PREFIX}-status-searching`);
    } else {
      el.classList.remove(`${CSS_PREFIX}-status-searching`);
    }
  }

  /**
   * Shows or hides the rate-limit notice.
   *
   * @param isThrottled - Whether the engine is currently throttled
   * @param currentDelay - Delay between deletes in ms
   */
  setThrottleState(isThrottled: boolean, currentDelay: number): void {
    const runningScreen = this.root?.querySelector('[data-screen="running"]');
    if (!runningScreen) {
      return;
    }
    const existing = runningScreen.querySelector(`.${CSS_PREFIX}-waiting`);
    if (!isThrottled) {
      existing?.remove();
      return;
    }
    const notice = (existing as HTMLElement | null) ?? document.createElement('div');
    notice.className = `${CSS_PREFIX}-waiting`;
    notice.textContent = `Rate limited - waiting ${Math.round(currentDelay / 1000)}s between deletes`;
    if (!existing) {
      this.elements?.eta?.insertAdjacentElement('afterend', notice);
    }
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
    this.setBoundText(root, 'completeIcon', COMPLETION_ICONS[summary.reason]);
    this.setBoundText(root, 'completeTitle', COMPLETION_TITLES[summary.reason]);
    this.setBoundText(
      root,
      'completeSummary',
      `${summary.deleted} deleted \u00B7 ${summary.skipped} skipped \u00B7 ${summary.failed} failed`,
    );
    this.setBoundText(root, 'completeDuration', `in ${formatDuration(summary.durationMs)}`);

    const detail = root.querySelector<HTMLElement>('[data-bind="completeDetail"]');
    if (detail) {
      const message =
        summary.reason === 'error'
          ? (summary.error?.message ?? 'Unknown error')
          : summary.channelCount > 1
            ? `${summary.channelsCompleted} of ${summary.channelCount} channels finished`
            : '';
      detail.textContent = message;
      detail.style.display = message ? 'block' : 'none';
    }

    if (summary.reason === 'completed' && summary.failed === 0) {
      const container = root.querySelector<HTMLElement>('[data-bind="confettiContainer"]');
      if (container) {
        createConfetti(container, 30);
      }
    }
  }

  /** Current progress percentage, used by the minimised indicator. */
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

    this.renderRing(els, this.percent);
    this.setText(els.percent, `${this.percent}%`);
    this.setText(els.count, `${processed} / ${total}`);
    this.setText(els.deleted, String(totals.deleted));
    this.setText(els.failed, String(totals.failed));
    this.setText(els.skipped, String(totals.skipped + totals.alreadyGone));
    this.renderTimes(els, stats, totals.deleted);
    this.renderThrottle(els, stats);
    this.renderMini(this.percent);
  }

  private renderRing(els: ProgressElements, percent: number): void {
    if (els.ring) {
      const circumference = 2 * Math.PI * PROGRESS_RING_RADIUS;
      els.ring.style.strokeDasharray = String(circumference);
      els.ring.style.strokeDashoffset = String(circumference - (percent / 100) * circumference);
    }
    if (els.bar) {
      els.bar.style.width = `${percent}%`;
    }
  }

  private renderTimes(
    els: ProgressElements,
    stats: { startTime: number; estimatedTimeRemaining: number },
    deleted: number,
  ): void {
    const elapsed = stats.startTime > 0 ? Date.now() - stats.startTime : 0;
    const elapsedMinutes = elapsed / 60000;
    this.setText(els.rate, String(elapsedMinutes > 0 ? Math.round(deleted / elapsedMinutes) : 0));
    this.setText(els.elapsed, formatDuration(elapsed));
    this.setText(
      els.eta,
      stats.estimatedTimeRemaining > 0 ? formatDuration(stats.estimatedTimeRemaining) : '--:--',
    );
  }

  private renderThrottle(
    els: ProgressElements,
    stats: { throttledCount: number; throttledTime: number },
  ): void {
    if (stats.throttledCount <= 0) {
      return;
    }
    if (els.throttleInfo) {
      els.throttleInfo.style.display = 'flex';
    }
    this.setText(
      els.throttleCount,
      `${stats.throttledCount}x (${formatDuration(stats.throttledTime)})`,
    );
  }

  private renderMini(percent: number): void {
    const indicator = this.miniIndicator;
    if (!indicator) {
      return;
    }
    const ring = indicator.querySelector<SVGCircleElement>('[data-bind="miniRing"]');
    if (ring) {
      const circumference = 2 * Math.PI * MINI_RING_RADIUS;
      ring.style.strokeDasharray = String(circumference);
      ring.style.strokeDashoffset = String(circumference - (percent / 100) * circumference);
    }
    const percentEl = indicator.querySelector<HTMLElement>('[data-bind="miniPercent"]');
    if (percentEl) {
      percentEl.textContent = `${percent}%`;
    }
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
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

/**
 * Builds one live-feed row.
 *
 * @param entry - The processed message
 * @returns A styled element describing the outcome
 */
export function createFeedElement(entry: FeedEntry): HTMLElement {
  const el = document.createElement('div');
  el.className = `${CSS_PREFIX}-feed-entry ${CSS_PREFIX}-feed-${entry.status.replace('_', '-')}`;
  const label = entry.reason
    ? `${FEED_LABELS[entry.status]}: ${entry.reason}`
    : FEED_LABELS[entry.status];
  el.textContent = `[${label}] ${truncate(entry.content || '[No content]', MAX_PREVIEW_LENGTH)}`;
  return el;
}
