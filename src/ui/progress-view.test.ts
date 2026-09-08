import { beforeEach, describe, expect, it } from 'vitest';
import type { DeletionEngineState, DeletionEngineStats } from './ports';
import { createFeedElement, ProgressView } from './progress-view';
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

describe('createFeedElement', () => {
  it('labels each outcome distinctly rather than always reporting success', () => {
    expect(createFeedElement({ messageId: '1', content: 'a', status: 'deleted' }).textContent).toBe(
      '[deleted] a',
    );
    expect(
      createFeedElement({ messageId: '2', content: 'b', status: 'already_gone' }).textContent,
    ).toBe('[already gone] b');
    expect(
      createFeedElement({ messageId: '3', content: 'c', status: 'skipped', reason: 'pinned' })
        .textContent,
    ).toBe('[skipped: pinned] c');
    expect(
      createFeedElement({
        messageId: '4',
        content: 'd',
        status: 'failed',
        reason: 'Missing Access',
      }).textContent,
    ).toBe('[failed: Missing Access] d');
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

  it('truncates long content', () => {
    const el = createFeedElement({ messageId: '1', content: 'x'.repeat(200), status: 'deleted' });
    expect(el.textContent?.endsWith('...')).toBe(true);
    expect((el.textContent ?? '').length).toBeLessThan(120);
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

  it('renders aggregated counters', () => {
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
    expect(text('progressCount')).toBe('4 / 4');
    expect(text('progressPercent')).toBe('100%');
  });

  it('shows the channel position only for multi-channel runs', () => {
    view.setChannelPosition({ index: 2, count: 5, channelId: '1' });
    expect(text('channelProgress')).toBe('Channel 2 of 5');
    view.setChannelPosition({ index: 1, count: 1, channelId: '1' });
    expect(text('channelProgress')).toBe('');
  });

  it('appends one feed row per processed message', () => {
    view.push(progress(), 'm1', 'first', { status: 'deleted' });
    view.push(progress(), 'm2', 'second', { status: 'failed', reason: 'nope' });
    const feed = root.querySelector('[data-bind="feed"]');
    expect(feed?.children).toHaveLength(2);
    expect(feed?.children[1]?.textContent).toContain('[failed: nope]');
  });

  it('announces a completed run and celebrates only a clean sweep', () => {
    view.showCompletion(summary());
    expect(text('completeTitle')).toBe('All clean!');
    expect(text('completeSummary')).toBe('5 deleted · 0 skipped · 0 failed');
    expect(root.querySelector('.confetti')).not.toBeNull();
  });

  it('does not celebrate when messages failed', () => {
    view.showCompletion(summary({ failed: 2 }));
    expect(text('completeSummary')).toContain('2 failed');
    expect(root.querySelector('.confetti')).toBeNull();
  });

  it('says so when a completed run left failures behind', () => {
    view.showCompletion(summary({ failed: 2 }));
    expect(text('completeTitle')).toBe('Finished with failures');
  });

  it('says so when a completed run skipped messages', () => {
    view.showCompletion(summary({ skipped: 3 }));
    expect(text('completeTitle')).toBe('Finished, some skipped');
    expect(root.querySelector('.confetti')).toBeNull();
  });

  it('reports failures ahead of skips when both happened', () => {
    view.showCompletion(summary({ failed: 1, skipped: 1 }));
    expect(text('completeTitle')).toBe('Finished with failures');
  });

  it('counts messages that were already gone', () => {
    view.showCompletion(summary({ alreadyGone: 4 }));
    expect(text('completeSummary')).toBe('5 deleted · 4 already gone · 0 skipped · 0 failed');
  });

  it('does not celebrate a run that deleted nothing', () => {
    view.showCompletion(summary({ deleted: 0 }));
    expect(text('completeTitle')).toBe('All clean!');
    expect(root.querySelector('.confetti')).toBeNull();
  });

  it('announces a run the user stopped', () => {
    view.showCompletion(summary({ reason: 'stopped', failed: 2, skipped: 1 }));
    expect(text('completeTitle')).toBe('Stopped by you');
    expect(root.querySelector('.confetti')).toBeNull();
  });

  it('announces an error and shows its message', () => {
    view.showCompletion(summary({ reason: 'error', error: new Error('rate limited too long') }));
    expect(text('completeTitle')).toBe('Stopped by an error');
    expect(text('completeDetail')).toBe('rate limited too long');
  });

  it('reports how many channels finished for a multi-channel run', () => {
    view.showCompletion(summary({ channelCount: 4, channelsCompleted: 3 }));
    expect(text('completeDetail')).toBe('3 of 4 channels finished');
  });

  it('shows and clears the rate-limit notice', () => {
    view.setThrottleState(true, 4200);
    const notice = root.querySelector('[data-screen="running"] .detcord-waiting');
    expect(notice?.textContent).toContain('4s');
    view.setThrottleState(false, 0);
    expect(root.querySelector('[data-screen="running"] .detcord-waiting')).toBeNull();
  });

  it('shows and clears the engine status line', () => {
    view.setStatus('Finding oldest message...');
    expect(text('currentMessage')).toBe('Finding oldest message...');
    expect(
      root
        .querySelector('[data-bind="currentMessage"]')
        ?.classList.contains('detcord-status-searching'),
    ).toBe(true);
    view.setStatus(undefined);
    expect(
      root
        .querySelector('[data-bind="currentMessage"]')
        ?.classList.contains('detcord-status-searching'),
    ).toBe(false);
  });

  it('keeps the minimised ring in step', () => {
    const mini = document.createElement('div');
    mini.innerHTML =
      '<svg><circle data-bind="miniRing"/></svg><div data-bind="miniPercent">0%</div>';
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
    expect(mini.querySelector('[data-bind="miniPercent"]')?.textContent).toBe('50%');
  });

  it('shows throttle statistics once the engine has been throttled', () => {
    view.push(progress({ stats: stats({ throttledCount: 3, throttledTime: 9000 }) }), 'm', 'x', {
      status: 'deleted',
    });
    expect(text('throttleCount')).toBe('3x (9s)');
    expect((root.querySelector('[data-bind="throttleInfo"]') as HTMLElement).style.display).toBe(
      'flex',
    );
  });

  it('clears the feed and counters on reset', () => {
    view.push(progress(), 'm1', 'x', { status: 'deleted' });
    view.reset();
    expect(root.querySelector('[data-bind="feed"]')?.children).toHaveLength(0);
    expect(text('deletedCount')).toBe('0');
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
