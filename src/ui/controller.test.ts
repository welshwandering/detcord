import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChannelIdFromUrl, getGuildIdFromUrl, getToken } from '../core/token';
import { snowflakeToDate } from '../utils/helpers';
import { DetcordUI, type DetcordUIOptions } from './controller';
import type {
  ApiClientPort,
  CurrentUser,
  DeletionEngineCallbacks,
  DeletionEngineOptions,
  DeletionEngineState,
  DeletionEngineStats,
  DiscordMessage,
  EnginePort,
  MessageOutcome,
  PreviewResult,
  SavedProgress,
} from './ports';

vi.mock('../core/token', () => ({
  getToken: vi.fn(),
  getAuthorId: vi.fn(),
  getGuildIdFromUrl: vi.fn(),
  getChannelIdFromUrl: vi.fn(),
}));

const GUILD = '999999999999999999';
const CHANNEL = '111111111111111111';
const CHANNEL_B = '222222222222222222';
const ROUTE = `/channels/${GUILD}/${CHANNEL}`;
const COUNTDOWN_MS = 3400;

function message(id: string, content = `content ${id}`): DiscordMessage {
  return {
    id,
    channel_id: CHANNEL,
    content,
    timestamp: '2024-01-01T00:00:00.000Z',
    type: 0,
    pinned: false,
    author: { id: 'author-1', username: 'me', discriminator: '0' },
  } as unknown as DiscordMessage;
}

class FakeEngine implements EnginePort {
  static instances: FakeEngine[] = [];
  static previewTotal = 4;
  static previewFiltersApplied = false;
  static previewError: Error | null = null;
  static script: Array<[DiscordMessage, MessageOutcome]> = [[message('m1'), { status: 'deleted' }]];
  static stopReason: 'completed' | 'stopped' | 'error' = 'completed';
  /** When set, every run holds here until the promise resolves. */
  static gate: Promise<void> | null = null;

  options: DeletionEngineOptions | null = null;
  callbacks: DeletionEngineCallbacks = {};
  startCount = 0;
  stopCount = 0;
  resumedFrom: SavedProgress | null = null;

  state: DeletionEngineState = {
    running: false,
    paused: false,
    deletedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    alreadyGoneCount: 0,
    totalFound: 4,
    initialTotalFound: 4,
    currentOffset: 0,
  };
  stats: DeletionEngineStats = {
    startTime: Date.now(),
    throttledCount: 0,
    throttledTime: 0,
    averagePing: 0,
    estimatedTimeRemaining: -1,
  };

  constructor() {
    FakeEngine.instances.push(this);
  }

  configure(options: DeletionEngineOptions): void {
    this.options = options;
  }

  setCallbacks(callbacks: DeletionEngineCallbacks): void {
    this.callbacks = callbacks;
  }

  async preview(): Promise<PreviewResult> {
    if (FakeEngine.previewError) {
      throw FakeEngine.previewError;
    }
    return {
      totalCount: FakeEngine.previewTotal,
      sampleMessages: [message('p1', 'preview sample')],
      estimatedTimeMs: 4000,
      filtersApplied: FakeEngine.previewFiltersApplied,
    };
  }

  resumeFromSaved(progress: SavedProgress): void {
    this.resumedFrom = progress;
  }

  async start(): Promise<void> {
    this.startCount++;
    this.state.running = true;
    if (FakeEngine.gate) {
      await FakeEngine.gate;
    }
    for (const [msg, outcome] of FakeEngine.script) {
      if (outcome.status === 'deleted') this.state.deletedCount++;
      if (outcome.status === 'failed') this.state.failedCount++;
      if (outcome.status === 'skipped') this.state.skippedCount++;
      this.callbacks.onProgress?.(this.state, this.stats, msg, outcome);
    }
    this.state.running = false;
    this.callbacks.onStop?.(this.state, this.stats, { reason: FakeEngine.stopReason });
  }

  pause(): void {
    this.state.paused = true;
  }

  resume(): void {
    this.state.paused = false;
  }

  stop(): void {
    this.stopCount++;
  }

  getState(): DeletionEngineState {
    return this.state;
  }

  getStats(): DeletionEngineStats {
    return this.stats;
  }
}

let currentUser: CurrentUser = { id: 'author-1', username: 'me', globalName: null };
let currentUserError: unknown = null;
let guildChannels: Array<{ id: string; name: string }> = [];
let getCurrentUserSpy = vi.fn();

function makeClient(): ApiClientPort {
  return {
    getCurrentUser: getCurrentUserSpy as unknown as () => Promise<CurrentUser>,
    getGuildChannels: vi
      .fn()
      .mockResolvedValue(guildChannels) as unknown as ApiClientPort['getGuildChannels'],
    searchMessages: vi.fn() as unknown as ApiClientPort['searchMessages'],
    deleteMessage: vi
      .fn()
      .mockResolvedValue('deleted') as unknown as ApiClientPort['deleteMessage'],
    getRateLimitInfo: () => null,
  };
}

function mountUI(overrides: Partial<DetcordUIOptions> = {}): DetcordUI {
  const ui = new DetcordUI({
    progressThrottleMs: 0,
    feedThrottleMs: 0,
    createApiClient: () => makeClient(),
    createEngine: () => new FakeEngine(),
    findResumableSession: () => null,
    ...overrides,
  });
  ui.mount();
  return ui;
}

async function flush(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

function click(selector: string): void {
  document.querySelector<HTMLElement>(selector)?.click();
}

function clickAction(action: string): void {
  click(`[data-action="${action}"]`);
}

function boundText(binding: string): string {
  return document.querySelector(`[data-bind="${binding}"]`)?.textContent ?? '';
}

function confirmButton(): HTMLButtonElement {
  return document.querySelector('[data-bind="confirmButton"]') as HTMLButtonElement;
}

/** Engines the runner drove: only those get callbacks wired up. */
function startedEngines(): FakeEngine[] {
  return FakeEngine.instances.filter((engine) => engine.callbacks.onStop !== undefined);
}

/** Engines built purely to count messages. */
function previewEngines(): FakeEngine[] {
  return FakeEngine.instances.filter((engine) => engine.callbacks.onStop === undefined);
}

/** Holds every run open until the returned function is called. */
function holdRuns(): () => Promise<void> {
  let release = (): void => {};
  FakeEngine.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    FakeEngine.gate = null;
    release();
    await flush();
  };
}

async function gotoReview(): Promise<void> {
  clickAction('nextStep');
  clickAction('nextStep');
  clickAction('nextStep');
  await flush();
}

describe('DetcordUI', () => {
  let ui: DetcordUI;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    window.history.pushState({}, '', ROUTE);
    FakeEngine.instances = [];
    FakeEngine.previewTotal = 4;
    FakeEngine.previewFiltersApplied = false;
    FakeEngine.previewError = null;
    FakeEngine.stopReason = 'completed';
    FakeEngine.gate = null;
    FakeEngine.script = [[message('m1'), { status: 'deleted' }]];
    currentUser = { id: 'author-1', username: 'me', globalName: null };
    currentUserError = null;
    guildChannels = [];
    getCurrentUserSpy = vi.fn(async () => {
      if (currentUserError) {
        throw currentUserError;
      }
      return currentUser;
    });
    vi.mocked(getToken).mockReturnValue('token-abc');
    vi.mocked(getGuildIdFromUrl).mockReturnValue(GUILD);
    vi.mocked(getChannelIdFromUrl).mockReturnValue(CHANNEL);
  });

  afterEach(() => {
    ui?.unmount();
    vi.useRealTimers();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.clearAllMocks();
  });

  // =========================================================================
  // Lifecycle
  // =========================================================================

  describe('lifecycle', () => {
    it('mounts, injects styles once and unmounts cleanly', () => {
      ui = mountUI();
      expect(document.getElementById('detcord-container')).not.toBeNull();
      expect(document.querySelectorAll('#detcord-styles')).toHaveLength(1);
      ui.mount();
      expect(document.querySelectorAll('#detcord-container')).toHaveLength(1);
      ui.unmount();
      expect(document.getElementById('detcord-container')).toBeNull();
      expect(document.getElementById('detcord-styles')).toBeNull();
      expect(() => ui.unmount()).not.toThrow();
    });

    it('toggles visibility and fires the callbacks', async () => {
      const onShow = vi.fn();
      const onHide = vi.fn();
      ui = mountUI({ onShow, onHide });
      expect(ui.isVisible()).toBe(false);
      ui.show();
      await flush();
      expect(ui.isVisible()).toBe(true);
      expect(document.querySelector('.detcord-window')?.classList.contains('visible')).toBe(true);
      ui.show();
      ui.hide();
      ui.hide();
      expect(ui.isVisible()).toBe(false);
      expect(onShow).toHaveBeenCalledTimes(1);
      expect(onHide).toHaveBeenCalledTimes(1);
    });

    it('does not show before mounting', () => {
      ui = new DetcordUI();
      ui.show();
      expect(ui.isVisible()).toBe(false);
    });

    it('switches screens', () => {
      ui = mountUI();
      ui.showScreen('running');
      expect(ui.getCurrentScreen()).toBe('running');
      expect(document.querySelector('[data-screen="running"]')?.classList.contains('active')).toBe(
        true,
      );
      expect(document.querySelector('[data-screen="setup"]')?.classList.contains('active')).toBe(
        false,
      );
    });

    it('closes on the backdrop and on Escape when idle', async () => {
      ui = mountUI();
      ui.show();
      await flush();
      click('.detcord-backdrop');
      expect(ui.isVisible()).toBe(false);

      ui.show();
      await flush();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(ui.isVisible()).toBe(false);
    });
  });

  // =========================================================================
  // Identity
  // =========================================================================

  describe('identity', () => {
    it('binds the extracted token to the account /users/@me reports', async () => {
      currentUser = { id: 'real-author', username: 'me', globalName: null };
      ui = mountUI();
      ui.show();
      await flush();
      expect(getCurrentUserSpy).toHaveBeenCalled();

      await gotoReview();
      expect(previewEngines()[0]?.options?.authorId).toBe('real-author');
    });

    it('shows the error screen when no token can be found', async () => {
      vi.mocked(getToken).mockReturnValue(null);
      ui = mountUI();
      ui.show();
      await flush();
      expect(ui.getCurrentScreen()).toBe('error');
      expect(boundText('errorMessage')).toMatch(/token/i);
    });

    it('reports a rejected token rather than guessing an account', async () => {
      currentUserError = { code: 'UNAUTHORIZED', message: '401' };
      ui = mountUI();
      ui.show();
      await flush();
      expect(ui.getCurrentScreen()).toBe('error');
      expect(boundText('errorMessage')).toBe('Token rejected by Discord.');
    });

    it('binds a manually pasted token to its own account', async () => {
      vi.mocked(getToken).mockReturnValue(null);
      ui = mountUI();
      ui.show();
      await flush();
      expect(ui.getCurrentScreen()).toBe('error');

      currentUser = { id: 'pasted-account', username: 'other', globalName: null };
      (document.querySelector('[data-input="manualToken"]') as HTMLInputElement).value =
        '!!!starts-with-punctuation';
      clickAction('useManualToken');
      await flush();

      expect(getCurrentUserSpy).toHaveBeenCalled();
      expect(ui.getCurrentScreen()).toBe('setup');
      // The pasted token is cleared from the DOM once accepted.
      expect((document.querySelector('[data-input="manualToken"]') as HTMLInputElement).value).toBe(
        '',
      );

      await gotoReview();
      expect(previewEngines()[0]?.options?.authorId).toBe('pasted-account');
      expect(previewEngines()[0]?.options?.authToken).toBe('!!!starts-with-punctuation');
    });

    it('rejects a manual token Discord refuses', async () => {
      vi.mocked(getToken).mockReturnValue(null);
      ui = mountUI();
      ui.show();
      await flush();
      currentUserError = { code: 'UNAUTHORIZED' };
      (document.querySelector('[data-input="manualToken"]') as HTMLInputElement).value = 'nope';
      clickAction('useManualToken');
      await flush();
      expect(boundText('errorMessage')).toBe('Token rejected by Discord.');
    });

    it('asks for a token when the field is empty', async () => {
      vi.mocked(getToken).mockReturnValue(null);
      ui = mountUI();
      ui.show();
      await flush();
      clickAction('useManualToken');
      await flush();
      expect(boundText('errorMessage')).toMatch(/enter a token/i);
    });
  });

  // =========================================================================
  // Review, gating and the preview/apply contract
  // =========================================================================

  describe('review step', () => {
    beforeEach(async () => {
      ui = mountUI();
      ui.show();
      await flush();
    });

    it('previews exactly the configuration the run will use', async () => {
      await gotoReview();
      const preview = previewEngines()[0];
      expect(preview?.options).toMatchObject({
        authToken: 'token-abc',
        authorId: 'author-1',
        channelId: CHANNEL,
      });

      clickAction('confirmDelete');
      await flush(COUNTDOWN_MS);

      const run = startedEngines()[0];
      expect(run).toBeDefined();
      expect(run?.options).toEqual(preview?.options);
    });

    it('shows the target and resolved range on the review screen', async () => {
      click('[data-timerange="24h"]');
      await gotoReview();
      const summary = document.querySelector('[data-bind="reviewSummary"]')?.textContent ?? '';
      expect(summary).toContain(CHANNEL);
      expect(summary).toContain('Last 24 hours');
      expect(boundText('reviewCount')).toBe('4');
    });

    it('keeps Begin Sweep disabled until a preview succeeds', async () => {
      clickAction('nextStep');
      clickAction('nextStep');
      expect(confirmButton().hasAttribute('disabled')).toBe(true);
      clickAction('nextStep');
      // Still scanning at this point.
      expect(confirmButton().hasAttribute('disabled')).toBe(true);
      await flush();
      expect(confirmButton().hasAttribute('disabled')).toBe(false);
    });

    it('keeps Begin Sweep disabled and reports the reason when the scan fails', async () => {
      FakeEngine.previewError = new Error('Search index is being built');
      await gotoReview();
      expect(confirmButton().hasAttribute('disabled')).toBe(true);
      expect(boundText('reviewError')).toBe('Search index is being built');
      expect(boundText('reviewCount')).toBe('?');

      clickAction('confirmDelete');
      await flush(COUNTDOWN_MS);
      expect(startedEngines()).toHaveLength(0);
    });

    it('keeps Begin Sweep disabled when nothing matches', async () => {
      FakeEngine.previewTotal = 0;
      await gotoReview();
      expect(confirmButton().hasAttribute('disabled')).toBe(true);
      expect(boundText('reviewError')).toMatch(/Nothing matches/);
    });

    it('words a filtered count as an upper bound', async () => {
      FakeEngine.previewFiltersApplied = true;
      await gotoReview();
      expect(boundText('reviewCount')).toBe('up to 4');
    });

    it('reports a regex the validator refuses, on the filters step', async () => {
      clickAction('nextStep');
      clickAction('nextStep');
      (document.querySelector('[data-input="pattern"]') as HTMLInputElement).value = '(a+)+';
      clickAction('nextStep');
      await flush();
      expect(boundText('patternError')).toMatch(/performance/i);
      expect(
        document.querySelector('[data-wizard-step="filters"]')?.classList.contains('active'),
      ).toBe(true);
      expect(previewEngines()).toHaveLength(0);
    });

    it('rejects a specific target with nothing selected', async () => {
      click('[data-target="specific"]');
      await flush();
      await gotoReview();
      expect(boundText('locationError')).toMatch(/at least one channel/i);
      expect(
        document.querySelector('[data-wizard-step="location"]')?.classList.contains('active'),
      ).toBe(true);
      expect(previewEngines()).toHaveLength(0);
      expect(confirmButton().hasAttribute('disabled')).toBe(true);
    });

    it('rejects a manual channel ID that is not a snowflake', async () => {
      click('[data-target="specific"]');
      await flush();
      (document.querySelector('[data-input="manualChannelId"]') as HTMLInputElement).value = '42';
      await gotoReview();
      expect(boundText('locationError')).toMatch(/not a valid Discord channel ID/);
      expect(previewEngines()).toHaveLength(0);
    });

    it('reports an unusable custom date range on the time range step', async () => {
      clickAction('nextStep');
      click('[data-timerange="custom"]');
      clickAction('nextStep');
      clickAction('nextStep');
      await flush();
      expect(boundText('timeRangeError')).toMatch(/at least one date/i);
      expect(
        document.querySelector('[data-wizard-step="timerange"]')?.classList.contains('active'),
      ).toBe(true);
    });
  });

  // =========================================================================
  // Time ranges
  // =========================================================================

  describe('time range presets', () => {
    it('turns "Last 24 hours" into exactly 24 hours', async () => {
      ui = mountUI();
      ui.show();
      await flush();
      clickAction('nextStep');
      click('[data-timerange="24h"]');
      clickAction('nextStep');
      clickAction('nextStep');
      await flush();

      const minId = previewEngines()[0]?.options?.minId as string;
      expect(minId).toBeDefined();
      const elapsed = Date.now() - snowflakeToDate(minId).getTime();
      // Allow a millisecond of slack for the clock reading inside the wizard.
      expect(elapsed).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
      expect(elapsed).toBeLessThan(24 * 60 * 60 * 1000 + 1000);
    });

    it('turns "Older than 30 days" into an upper bound only', async () => {
      ui = mountUI();
      ui.show();
      await flush();
      clickAction('nextStep');
      click('[data-timerange="older-30d"]');
      clickAction('nextStep');
      clickAction('nextStep');
      await flush();

      const options = previewEngines()[0]?.options;
      expect(options?.minId).toBeUndefined();
      const elapsed = Date.now() - snowflakeToDate(options?.maxId as string).getTime();
      expect(elapsed).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 * 1000);
      expect(elapsed).toBeLessThan(30 * 24 * 60 * 60 * 1000 + 1000);
    });
  });

  // =========================================================================
  // Invalidation and the countdown
  // =========================================================================

  describe('confirmation safety', () => {
    beforeEach(async () => {
      ui = mountUI();
      ui.show();
      await flush();
      await gotoReview();
    });

    it('refuses to start after the SPA navigates elsewhere', async () => {
      window.history.pushState({}, '', `/channels/${GUILD}/${CHANNEL_B}`);
      vi.mocked(getChannelIdFromUrl).mockReturnValue(CHANNEL_B);

      clickAction('confirmDelete');
      await flush(COUNTDOWN_MS);

      expect(startedEngines()).toHaveLength(0);
      expect(boundText('locationError')).toMatch(/navigated to a different channel/);
      expect(
        document.querySelector('[data-wizard-step="location"]')?.classList.contains('active'),
      ).toBe(true);
    });

    it('cancels the countdown when the route changes mid-count', async () => {
      clickAction('confirmDelete');
      await flush(500);
      window.history.pushState({}, '', `/channels/${GUILD}/${CHANNEL_B}`);
      vi.mocked(getChannelIdFromUrl).mockReturnValue(CHANNEL_B);
      await flush(COUNTDOWN_MS);

      expect(startedEngines()).toHaveLength(0);
      expect(document.querySelector('.detcord-countdown-overlay')).toBeNull();
    });

    it('ignores a second click while the countdown runs', async () => {
      clickAction('confirmDelete');
      clickAction('confirmDelete');
      clickAction('confirmDelete');
      await flush(COUNTDOWN_MS);
      expect(startedEngines()).toHaveLength(1);
    });

    it('cancels the countdown when the window is closed', async () => {
      clickAction('confirmDelete');
      await flush(500);
      ui.hide();
      await flush(COUNTDOWN_MS);
      expect(startedEngines()).toHaveLength(0);
      expect(document.querySelector('.detcord-countdown-overlay')).toBeNull();
    });

    it('cancels the countdown when the wizard is reset', async () => {
      clickAction('confirmDelete');
      await flush(500);
      clickAction('reset');
      await flush(COUNTDOWN_MS);
      expect(startedEngines()).toHaveLength(0);
    });

    it('does nothing when Begin Sweep is clicked with no reviewed config', async () => {
      clickAction('reset');
      await flush();
      clickAction('confirmDelete');
      await flush(COUNTDOWN_MS);
      expect(startedEngines()).toHaveLength(0);
    });
  });

  // =========================================================================
  // Running
  // =========================================================================

  describe('running a deletion', () => {
    beforeEach(async () => {
      ui = mountUI();
      ui.show();
      await flush();
    });

    it('walks the whole flow through to the completion screen', async () => {
      FakeEngine.script = [
        [message('a', 'first'), { status: 'deleted' }],
        [message('b', 'second'), { status: 'deleted' }],
      ];
      await gotoReview();
      expect(boundText('previewContent')).toContain('preview sample');

      clickAction('confirmDelete');
      await flush(COUNTDOWN_MS);

      expect(ui.getCurrentScreen()).toBe('complete');
      expect(boundText('completeTitle')).toBe('All clean!');
      expect(boundText('completeSummary')).toContain('2 deleted');
    });

    it('renders failed and skipped outcomes distinctly', async () => {
      FakeEngine.script = [
        [message('a'), { status: 'deleted' }],
        [message('b'), { status: 'failed', reason: 'Missing Access' }],
        [message('c'), { status: 'skipped', reason: 'pinned' }],
      ];
      await gotoReview();
      clickAction('confirmDelete');
      await flush(COUNTDOWN_MS);

      const feed = document.querySelector('[data-bind="feed"]')?.textContent ?? '';
      expect(feed).toContain('[deleted]');
      expect(feed).toContain('[failed: Missing Access]');
      expect(feed).toContain('[skipped: pinned]');
      expect(boundText('completeSummary')).toBe('1 deleted · 1 skipped · 1 failed');
      expect(document.querySelector('.confetti')).toBeNull();
    });

    it('reports a run the user stopped', async () => {
      FakeEngine.stopReason = 'stopped';
      await gotoReview();
      clickAction('confirmDelete');
      await flush(COUNTDOWN_MS);
      expect(boundText('completeTitle')).toBe('Stopped by you');
    });

    it('offers a choice instead of hiding while a run is active', async () => {
      const releaseRun = holdRuns();

      await gotoReview();
      clickAction('confirmDelete');
      await flush(COUNTDOWN_MS);
      expect(ui.isRunning()).toBe(true);

      clickAction('close');
      expect(ui.isVisible()).toBe(true);
      expect(document.querySelector('[data-bind="runChoice"]')?.classList.contains('visible')).toBe(
        true,
      );

      clickAction('stopRun');
      expect(startedEngines()[0]?.stopCount).toBeGreaterThan(0);

      await releaseRun();
    });

    it('lets the run continue in the background', async () => {
      const releaseRun = holdRuns();

      await gotoReview();
      clickAction('confirmDelete');
      await flush(COUNTDOWN_MS);

      clickAction('close');
      clickAction('keepRunning');
      expect(ui.isVisible()).toBe(false);
      expect(startedEngines()[0]?.stopCount).toBe(0);

      await releaseRun();
    });

    it('toggles the pause button label', async () => {
      const releaseRun = holdRuns();

      await gotoReview();
      clickAction('confirmDelete');
      await flush(COUNTDOWN_MS);

      clickAction('pause');
      expect(document.querySelector('[data-action="pause"]')?.textContent).toBe('Resume');
      clickAction('pause');
      expect(document.querySelector('[data-action="pause"]')?.textContent).toBe('Pause');

      await releaseRun();
    });
  });

  // =========================================================================
  // Multi-channel
  // =========================================================================

  describe('multi-channel runs', () => {
    beforeEach(async () => {
      guildChannels = [
        { id: CHANNEL, name: 'general' },
        { id: CHANNEL_B, name: 'random' },
      ];
      ui = mountUI();
      ui.show();
      await flush();
      click('[data-target="specific"]');
      await flush();
      click(`[data-channel-id="${CHANNEL}"]`);
      click(`[data-channel-id="${CHANNEL_B}"]`);
    });

    it('sums the preview across every selected channel', async () => {
      await gotoReview();
      expect(previewEngines()).toHaveLength(2);
      expect(boundText('reviewCount')).toBe('8');
      expect(boundText('reviewDetails')).toContain('Across 2 channels');
    });

    it('runs once per channel with one config per channel', async () => {
      await gotoReview();
      const previewOptions = previewEngines().map((engine) => engine.options);
      clickAction('confirmDelete');
      await flush(COUNTDOWN_MS);

      const runs = startedEngines();
      expect(runs).toHaveLength(2);
      expect(runs.map((engine) => engine.options?.channelId)).toEqual([CHANNEL, CHANNEL_B]);
      expect(runs.map((engine) => engine.options)).toEqual(previewOptions);
      expect(boundText('completeSummary')).toContain('2 deleted');
    });

    it('shows which channel is being processed', async () => {
      const releaseRun = holdRuns();

      await gotoReview();
      clickAction('confirmDelete');
      await flush(COUNTDOWN_MS);
      expect(boundText('channelProgress')).toBe('Channel 1 of 2');

      await releaseRun();
    });
  });

  // =========================================================================
  // Resume
  // =========================================================================

  describe('resume', () => {
    const saved: SavedProgress = {
      version: 2,
      runId: 'run-1',
      authorId: 'author-1',
      channelId: CHANNEL,
      deletionOrder: 'newest',
      cursor: { maxId: '900000000000000000' },
      deletedCount: 12,
      failedCount: 0,
      skippedCount: 0,
      alreadyGoneCount: 0,
      totalFound: 40,
      initialTotalFound: 40,
      timestamp: Date.parse('2024-05-01T10:00:00Z'),
    };

    it('offers to resume an interrupted session', async () => {
      ui = mountUI({ findResumableSession: () => saved });
      ui.show();
      await flush();
      expect(
        document.querySelector('[data-bind="resumePrompt"]')?.classList.contains('visible'),
      ).toBe(true);
      const text = boundText('resumeText');
      expect(text).toContain('12 of 40 done');
      expect(text).toContain(CHANNEL);
    });

    it('resumes through the engine with the saved session', async () => {
      ui = mountUI({ findResumableSession: () => saved });
      ui.show();
      await flush();
      clickAction('resumeSession');
      await flush();

      const run = startedEngines()[0];
      expect(run).toBeDefined();
      expect(run?.resumedFrom).toBe(saved);
      expect(run?.options?.channelId).toBe(CHANNEL);
      expect(
        document.querySelector('[data-bind="resumePrompt"]')?.classList.contains('visible'),
      ).toBe(false);
    });

    it('discards a session without starting anything', async () => {
      ui = mountUI({ findResumableSession: () => saved });
      ui.show();
      await flush();
      clickAction('discardSession');
      await flush();
      expect(startedEngines()).toHaveLength(0);
      expect(
        document.querySelector('[data-bind="resumePrompt"]')?.classList.contains('visible'),
      ).toBe(false);
    });

    it('hides the prompt when there is nothing to resume', async () => {
      ui = mountUI();
      ui.show();
      await flush();
      expect(
        document.querySelector('[data-bind="resumePrompt"]')?.classList.contains('visible'),
      ).toBe(false);
    });

    it('survives a persistence lookup that throws', async () => {
      ui = mountUI({
        findResumableSession: () => {
          throw new Error('storage blocked');
        },
      });
      ui.show();
      await flush();
      expect(ui.getCurrentScreen()).toBe('setup');
    });
  });

  // =========================================================================
  // Channel picker and reset
  // =========================================================================

  describe('wizard controls', () => {
    beforeEach(async () => {
      guildChannels = [
        { id: CHANNEL, name: 'general' },
        { id: CHANNEL_B, name: '<img src=x>' },
      ];
      ui = mountUI();
      ui.show();
      await flush();
    });

    it('loads channels and escapes their names', async () => {
      click('[data-target="specific"]');
      await flush();
      const list = document.querySelector('[data-bind="channelList"]') as HTMLElement;
      expect(list.querySelectorAll('[data-channel-id]')).toHaveLength(2);
      expect(list.querySelector('img')).toBeNull();
      expect(list.textContent).toContain('<img src=x>');
    });

    it('filters channels as the user types', async () => {
      click('[data-target="specific"]');
      await flush();
      const search = document.querySelector('[data-input="channelSearch"]') as HTMLInputElement;
      search.value = 'gene';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      const general = document.querySelector<HTMLElement>(`[data-channel-id="${CHANNEL}"]`);
      const other = document.querySelector<HTMLElement>(`[data-channel-id="${CHANNEL_B}"]`);
      expect(general?.style.display).toBe('');
      expect(other?.style.display).toBe('none');
    });

    it('counts the selected channels', async () => {
      click('[data-target="specific"]');
      await flush();
      click(`[data-channel-id="${CHANNEL}"]`);
      expect(boundText('selectedChannelCount')).toBe('1 channel selected');
      click(`[data-channel-id="${CHANNEL_B}"]`);
      expect(boundText('selectedChannelCount')).toBe('2 channels selected');
      click(`[data-channel-id="${CHANNEL_B}"]`);
      expect(boundText('selectedChannelCount')).toBe('1 channel selected');
    });

    it('resets state and DOM together after a run', async () => {
      click('[data-toggle="hasLink"]');
      click('[data-timerange="24h"]');
      click('[data-target="specific"]');
      await flush();
      click(`[data-channel-id="${CHANNEL}"]`);

      clickAction('reset');
      await flush();

      expect(ui.getCurrentScreen()).toBe('setup');
      expect(document.querySelector('[data-toggle="hasLink"]')?.classList.contains('on')).toBe(
        false,
      );
      expect(
        document.querySelector('[data-target="channel"]')?.classList.contains('selected'),
      ).toBe(true);
      expect(document.querySelector('[data-timerange="all"]')?.classList.contains('selected')).toBe(
        true,
      );
      expect(boundText('selectedChannelCount')).toBe('');

      // The rebuilt config must reflect the reset state, not the old filters.
      await gotoReview();
      const options = previewEngines()[0]?.options;
      expect(options?.channelId).toBe(CHANNEL);
      expect(options?.hasLink).toBe(false);
      expect(options?.minId).toBeUndefined();
    });

    it('carries the filter toggles into the config', async () => {
      clickAction('nextStep');
      clickAction('nextStep');
      click('[data-toggle="hasLink"]');
      click('[data-toggle="includePinned"]');
      clickAction('nextStep');
      await flush();
      expect(previewEngines()[0]?.options).toMatchObject({
        hasLink: true,
        hasFile: false,
        includePinned: true,
      });
    });

    it('only offers the server card inside a server', async () => {
      const serverCard = document.querySelector('[data-bind="serverCard"]') as HTMLElement;
      const dmCard = document.querySelector('[data-bind="dmCard"]') as HTMLElement;
      expect(serverCard.style.display).toBe('block');
      expect(dmCard.style.display).toBe('none');
    });

    it('ignores clicks that are not actions', () => {
      const before = ui.getCurrentScreen();
      document.querySelector<HTMLElement>('.detcord-content')?.click();
      expect(ui.getCurrentScreen()).toBe(before);
    });
  });

  // =========================================================================
  // Minimise
  // =========================================================================

  describe('minimise', () => {
    it('closes rather than minimising while idle', async () => {
      ui = mountUI();
      ui.show();
      await flush();
      clickAction('minimize');
      expect(ui.isVisible()).toBe(false);
    });

    it('minimises to an indicator while a run is active', async () => {
      const releaseRun = holdRuns();

      ui = mountUI();
      ui.show();
      await flush();
      await gotoReview();
      clickAction('confirmDelete');
      await flush(COUNTDOWN_MS);

      clickAction('minimize');
      const indicator = document.querySelector('.detcord-mini-indicator');
      expect(indicator?.classList.contains('visible')).toBe(true);
      expect(document.querySelector('.detcord-window')?.classList.contains('visible')).toBe(false);

      clickAction('maximize');
      expect(indicator?.classList.contains('visible')).toBe(false);

      await releaseRun();
    });
  });
});
