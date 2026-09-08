import { beforeEach, describe, expect, it } from 'vitest';
import type { DeletionEngineState, DeletionEngineStats } from './ports';
import { completionReceipt, createFeedElement, ProgressView } from './progress-view';
import type { RunProgress, RunSummary } from './runner';
import { createWindowHTML } from './window-markup';

function state(overrides: Partial<DeletionEngineState> = {}): DeletionEngineState {
  return {
    running: true,
    paused: false,
    deletedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    alreadyGoneCount: 0,
    totalFound: 10,
    initialTotalFound: 10,
    currentOffset: 0,
    ...overrides,
  };
}

function stats(overrides: Partial<DeletionEngineStats> = {}): DeletionEngineStats {
  return {
    startTime: Date.now() - 60_000,
    throttledCount: 0,
    throttledTime: 0,
    averagePing: 0,
    estimatedTimeRemaining: -1,
    ...overrides,
  };
}

function progress(overrides: Partial<RunProgress> = {}): RunProgress {
  return {
    position: { index: 1, count: 1, channelId: '111111111111111111' },
    state: state(),
    stats: stats(),
    totals: { deleted: 0, failed: 0, skipped: 0, alreadyGone: 0 },
    ...overrides,
  };
}

function summary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    reason: 'completed',
    error: null,
    durationMs: 5000,
    deleted: 5,
    failed: 0,
    skipped: 0,
    alreadyGone: 0,
    channelsCompleted: 1,
    channelCount: 1,
    ...overrides,
  };
}

/** The visible parts of a log row, in the order they are rendered. */
function rowParts(el: HTMLElement): string[] {
  return [...el.children].map((child) => child.textContent ?? '');
}

describe('createFeedElement', () => {
  const at = Date.parse('2024-05-01T17:26:41');

  it('renders a time column, an outcome and the message text', () => {
    const el = createFeedElement({ messageId: '1', content: 'hello', status: 'deleted', at });
    expect(rowParts(el)).toEqual(['17:26:41', 'deleted', 'hello']);
  });

  it('labels each outcome distinctly rather than always reporting success', () => {
    const label = (entry: Parameters<typeof createFeedElement>[0]): string =>
      createFeedElement(entry).querySelector('.detcord-log-outcome')?.textContent ?? '';

    expect(label({ messageId: '1', content: 'a', status: 'deleted' })).toBe('deleted');
    expect(label({ messageId: '2', content: 'b', status: 'already_gone' })).toBe('already gone');
    expect(label({ messageId: '3', content: 'c', status: 'skipped', reason: 'pinned' })).toBe(
      'skipped · pinned',
    );
    expect(label({ messageId: '4', content: 'd', status: 'failed', reason: '403' })).toBe(
      'failed · 403',
    );
  });

  it('carries an outcome-specific class', () => {
    expect(
      createFeedElement({ messageId: '1', content: 'a', status: 'failed' }).className,
    ).toContain('detcord-feed-failed');
    expect(
      createFeedElement({ messageId: '1', content: 'a', status: 'already_gone' }).className,
    ).toContain('detcord-feed-already-gone');
  });

  it('writes message content as text, never as markup', () => {
    const el = createFeedElement({
      messageId: '1',
      content: '<img src=x onerror=alert(1)>',
      status: 'deleted',
    });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('truncates long content with an ellipsis', () => {
    const el = createFeedElement({ messageId: '1', content: 'x'.repeat(200), status: 'deleted' });
    const text = el.querySelector('.detcord-log-text')?.textContent ?? '';
    expect(text.endsWith('…')).toBe(true);
    expect(text.length).toBe(81);
  });

  it('names an empty message rather than rendering a blank row', () => {
    const el = createFeedElement({ messageId: '1', content: '', status: 'deleted' });
    expect(el.querySelector('.detcord-log-text')?.textContent).toBe('[No content]');
  });
});

describe('completionReceipt', () => {
  it('lists the outcomes and the duration', () => {
    expect(completionReceipt(summary())).toEqual([
      { label: 'Deleted', value: '5' },
      { label: 'Skipped', value: '0' },
      { label: 'Failed', value: '0' },
      { label: 'Duration', value: '5s' },
    ]);
  });

  it('adds already gone only when there were any', () => {
    const labels = completionReceipt(summary({ alreadyGone: 4 })).map((row) => row.label);
    expect(labels).toContain('Already gone');
    expect(completionReceipt(summary()).map((row) => row.label)).not.toContain('Already gone');
  });

  it('adds channels only for a multi-channel run', () => {
    const rows = completionReceipt(summary({ channelCount: 4, channelsCompleted: 3 }));
    expect(rows).toContainEqual({ label: 'Channels', value: '3 of 4' });
    expect(completionReceipt(summary()).map((row) => row.label)).not.toContain('Channels');
  });
});

describe('ProgressView', () => {
  let root: HTMLElement;
  let view: ProgressView;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    root.innerHTML = createWindowHTML();
    document.body.appendChild(root);
    view = new ProgressView({ maxFeedEntries: 10, progressThrottleMs: 0, feedThrottleMs: 0 });
    view.attach(root);
    view.reset();
  });

  const text = (binding: string): string =>
    root.querySelector(`[data-bind="${binding}"]`)?.textContent ?? '';

  const receiptRows = (): string[][] =>
    [...root.querySelectorAll('[data-bind="completeReceipt"] .detcord-receipt-row')].map((row) =>
      [...row.children].map((cell) => cell.textContent ?? ''),
    );

  it('renders the count as "processed of total" and moves the bar', () => {
    view.push(
      progress({
        state: state({ initialTotalFound: 12 }),
        totals: { deleted: 5, failed: 1, skipped: 1, alreadyGone: 0 },
      }),
      'm1',
      'hello',
      { status: 'deleted' },
    );
    expect(text('progressCount')).toBe('7 of 12');
    expect((root.querySelector('[data-bind="progressBar"]') as HTMLElement).style.width).toBe(
      '58%',
    );
  });

  it('renders each figure separately rather than folding them together', () => {
    view.push(
      progress({
        state: state({ initialTotalFound: 4 }),
        totals: { deleted: 2, failed: 1, skipped: 1, alreadyGone: 0 },
      }),
      'm1',
      'hello',
      { status: 'deleted' },
    );
    expect(text('deletedCount')).toBe('2');
    expect(text('failedCount')).toBe('1');
    expect(text('skippedCount')).toBe('1');
  });

  it('shows the already-gone figure only once there is one', () => {
    const figure = root.querySelector('[data-bind="alreadyGoneFigure"]') as HTMLElement;
    expect(figure.classList.contains('detcord-run-figure-hidden')).toBe(true);

    view.push(
      progress({ totals: { deleted: 1, failed: 0, skipped: 0, alreadyGone: 3 } }),
      'm1',
      'x',
      { status: 'already_gone' },
    );
    expect(figure.classList.contains('detcord-run-figure-hidden')).toBe(false);
    expect(text('alreadyGone')).toBe('3');
  });

  it('shows the channel position only for multi-channel runs', () => {
    view.setChannelPosition({ index: 2, count: 5, channelId: '1' });
    expect(text('channelProgress')).toBe('Channel 2 of 5');
    view.setChannelPosition({ index: 1, count: 1, channelId: '1' });
    expect(text('channelProgress')).toBe('');
  });

  it('appends one log row per processed message', () => {
    view.push(progress(), 'm1', 'first', { status: 'deleted' });
    view.push(progress(), 'm2', 'second', { status: 'failed', reason: 'nope' });
    const feed = root.querySelector('[data-bind="feed"]');
    expect(feed?.children).toHaveLength(2);
    expect(feed?.children[1]?.textContent).toContain('failed · nope');
  });

  // =========================================================================
  // Status line
  // =========================================================================

  it('states what the engine is doing', () => {
    expect(text('statusMessage')).toBe('Deleting…');
    view.setStatus("Waiting for Discord's search index…");
    expect(text('statusMessage')).toBe("Waiting for Discord's search index…");
    view.setStatus(undefined);
    expect(text('statusMessage')).toBe('Deleting…');
  });

  it('names the rate-limit wait in seconds', () => {
    view.setThrottleState(true, 4200);
    expect(text('statusMessage')).toBe("Waiting 4 s for Discord's rate limit");
    view.setThrottleState(false, 0);
    expect(text('statusMessage')).toBe('Deleting…');
  });

  it('reports a pause ahead of any wait', () => {
    view.setThrottleState(true, 4000);
    view.setPaused(true);
    expect(text('statusMessage')).toBe('Paused');
    view.setPaused(false);
    expect(text('statusMessage')).toBe("Waiting 4 s for Discord's rate limit");
  });

  // =========================================================================
  // Completion
  // =========================================================================

  it('titles a clean run by what it deleted', () => {
    view.showCompletion(summary());
    expect(text('completeTitle')).toBe('5 deleted');
    expect(receiptRows()).toEqual([
      ['Deleted', '5'],
      ['Skipped', '0'],
      ['Failed', '0'],
      ['Duration', '5s'],
    ]);
  });

  it('says so when a completed run left failures behind', () => {
    view.showCompletion(summary({ failed: 2 }));
    expect(text('completeTitle')).toBe('2 could not be deleted');
  });

  it('says so when a completed run skipped messages', () => {
    view.showCompletion(summary({ skipped: 3 }));
    expect(text('completeTitle')).toBe('Finished, 3 skipped');
  });

  it('reports failures ahead of skips when both happened', () => {
    view.showCompletion(summary({ failed: 1, skipped: 1 }));
    expect(text('completeTitle')).toBe('1 could not be deleted');
  });

  it('counts messages that were already gone', () => {
    view.showCompletion(summary({ alreadyGone: 4 }));
    expect(receiptRows()).toContainEqual(['Already gone', '4']);
  });

  it('announces a run the user stopped and offers to resume it later', () => {
    view.showCompletion(summary({ reason: 'stopped', deleted: 7, failed: 2, skipped: 1 }));
    expect(text('completeTitle')).toBe('Stopped after 7');
    expect(
      (root.querySelector('[data-bind="completeResumeNote"]') as HTMLElement).style.display,
    ).toBe('block');
  });

  it('offers no resume note after a run that finished', () => {
    view.showCompletion(summary());
    expect(
      (root.querySelector('[data-bind="completeResumeNote"]') as HTMLElement).style.display,
    ).toBe('none');
  });

  it('announces an error and shows its message', () => {
    view.showCompletion(summary({ reason: 'error', error: new Error('rate limited too long') }));
    expect(text('completeTitle')).toBe('Stopped by an error');
    expect(text('completeDetail')).toBe('rate limited too long');
  });

  it('reports how many channels finished for a multi-channel run', () => {
    view.showCompletion(summary({ channelCount: 4, channelsCompleted: 3 }));
    expect(receiptRows()).toContainEqual(['Channels', '3 of 4']);
  });

  it('replaces the previous receipt rather than appending to it', () => {
    view.showCompletion(summary({ alreadyGone: 2 }));
    view.showCompletion(summary());
    expect(receiptRows()).toHaveLength(4);
  });

  // =========================================================================
  // Minimised indicator and lifecycle
  // =========================================================================

  it('keeps the minimised pill in step', () => {
    const mini = document.createElement('div');
    mini.innerHTML = '<span data-bind="miniCount">0 / 0</span>';
    view.setMiniIndicator(mini);
    view.push(
      progress({
        state: state({ initialTotalFound: 4 }),
        totals: { deleted: 2, failed: 0, skipped: 0, alreadyGone: 0 },
      }),
      'm1',
      'x',
      { status: 'deleted' },
    );
    expect(mini.querySelector('[data-bind="miniCount"]')?.textContent).toBe('2 / 4');
    expect(view.getPercent()).toBe(50);
  });

  it('clears the log, counters and status on reset', () => {
    view.setPaused(true);
    view.push(
      progress({ totals: { deleted: 1, failed: 0, skipped: 0, alreadyGone: 2 } }),
      'm1',
      'x',
      { status: 'deleted' },
    );
    view.reset();
    expect(root.querySelector('[data-bind="feed"]')?.children).toHaveLength(0);
    expect(text('deletedCount')).toBe('0');
    expect(text('progressCount')).toBe('0 of 0');
    expect(text('statusMessage')).toBe('Deleting…');
    expect(
      root
        .querySelector('[data-bind="alreadyGoneFigure"]')
        ?.classList.contains('detcord-run-figure-hidden'),
    ).toBe(true);
  });

  it('tolerates being used before attach and after dispose', () => {
    const detached = new ProgressView({
      maxFeedEntries: 5,
      progressThrottleMs: 0,
      feedThrottleMs: 0,
    });
    expect(() => {
      detached.reset();
      detached.setStatus('x');
      detached.setPaused(true);
      detached.setThrottleState(true, 1000);
      detached.setChannelPosition({ index: 1, count: 2, channelId: 'c' });
      detached.push(progress(), 'm', 'x', { status: 'deleted' });
      detached.showCompletion(summary());
      detached.flush(null);
      detached.dispose();
    }).not.toThrow();
    expect(detached.getPercent()).toBe(0);
  });
});
