import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPageStorage } from '../core/storage';
import type {
  ApiClientPort,
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
import { buildRunConfig, type RunConfig } from './run-config';
import { loadRunPlan, type RunPlan } from './run-plan';
import { DeletionRunner, type RunProgress, type RunSummary } from './runner';

const CHANNEL_A = '111111111111111111';
const CHANNEL_B = '222222222222222222';
const CHANNEL_C = '333333333333333333';

function message(id: string): DiscordMessage {
  return {
    id,
    channel_id: CHANNEL_A,
    content: `message ${id}`,
    timestamp: '2024-01-01T00:00:00.000Z',
    type: 0,
    pinned: false,
    author: { id: 'author-1', username: 'me', discriminator: '0' },
  } as unknown as DiscordMessage;
}

class FakeEngine implements EnginePort {
  static instances: FakeEngine[] = [];
  /** Gate handed to the next engine constructed, so a run can be held open. */
  static nextGate: Promise<void> | null = null;

  options: DeletionEngineOptions | null = null;
  callbacks: DeletionEngineCallbacks = {};
  startCount = 0;
  stopCount = 0;
  pauseCount = 0;
  resumeCount = 0;
  resumedFrom: SavedProgress | null = null;
  previewResult: PreviewResult = {
    totalCount: 4,
    sampleMessages: [message('m1')],
    estimatedTimeMs: 4000,
    filtersApplied: false,
  };
  previewError: Error | null = null;
  startError: Error | null = null;
  script: Array<[DiscordMessage, MessageOutcome]> = [[message('m1'), { status: 'deleted' }]];
  stopReason: RunSummary['reason'] = 'completed';
  gate: Promise<void> | null = null;

  state: DeletionEngineState = {
    running: false,
    paused: false,
    deletedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    alreadyGoneCount: 0,
    totalFound: 10,
    initialTotalFound: 10,
    currentOffset: 0,
  };
  stats: DeletionEngineStats = {
    startTime: 1000,
    throttledCount: 0,
    throttledTime: 0,
    averagePing: 0,
    estimatedTimeRemaining: -1,
  };

  constructor() {
    this.gate = FakeEngine.nextGate;
    FakeEngine.nextGate = null;
    FakeEngine.instances.push(this);
  }

  configure(options: DeletionEngineOptions): void {
    this.options = options;
  }

  setCallbacks(callbacks: DeletionEngineCallbacks): void {
    this.callbacks = callbacks;
  }

  async preview(): Promise<PreviewResult> {
    if (this.previewError) {
      throw this.previewError;
    }
    return this.previewResult;
  }

  resumeFromSaved(progress: SavedProgress): void {
    this.resumedFrom = progress;
    this.state.deletedCount = progress.deletedCount;
  }

  async start(): Promise<void> {
    this.startCount++;
    this.state.running = true;
    if (this.gate) {
      await this.gate;
    }
    if (this.startError) {
      this.state.running = false;
      this.callbacks.onError?.(this.startError);
      this.callbacks.onStop?.(this.state, this.stats, { reason: 'error' });
      throw this.startError;
    }
    for (const [msg, outcome] of this.script) {
      this.tally(outcome);
      this.callbacks.onProgress?.(this.state, this.stats, msg, outcome);
    }
    this.state.running = false;
    this.callbacks.onStop?.(this.state, this.stats, { reason: this.stopReason });
  }

  private tally(outcome: MessageOutcome): void {
    if (outcome.status === 'deleted') this.state.deletedCount++;
    if (outcome.status === 'failed') this.state.failedCount++;
    if (outcome.status === 'skipped') this.state.skippedCount++;
    if (outcome.status === 'already_gone') this.state.alreadyGoneCount++;
  }

  pause(): void {
    this.pauseCount++;
    this.state.paused = true;
  }

  resume(): void {
    this.resumeCount++;
    this.state.paused = false;
  }

  stop(): void {
    this.stopCount++;
    this.stopReason = 'stopped';
  }

  getState(): DeletionEngineState {
    return this.state;
  }

  getStats(): DeletionEngineStats {
    return this.stats;
  }
}

function fakeClient(): ApiClientPort {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({ id: 'author-1', username: 'me', globalName: null }),
    getGuildChannels: vi.fn().mockResolvedValue([]),
    searchMessages: vi.fn(),
    deleteMessage: vi.fn().mockResolvedValue('deleted'),
    getRateLimitInfo: () => null,
  };
}

function configFor(channelIds: string[]): RunConfig {
  const result = buildRunConfig({
    authorId: 'author-1',
    scope: channelIds.length === 1 ? 'channel' : 'specific',
    guildId: null,
    urlChannelId: channelIds[0] ?? null,
    routePath: '/channels/1/2',
    selectedChannelIds: channelIds.length === 1 ? [] : channelIds,
    manualChannelId: '',
    after: null,
    before: null,
    timeRangeLabel: 'Everything',
    content: '',
    pattern: '',
    hasLink: false,
    hasFile: false,
    includePinned: false,
    deletionOrder: 'newest',
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.config;
}

function makeRunner(callbacks = {}) {
  const client = fakeClient();
  return new DeletionRunner({
    createApiClient: () => client,
    createEngine: () => new FakeEngine(),
    callbacks,
  });
}

/** Holds the next engine's `start()` open until the returned function is called. */
function holdNextEngine(): () => void {
  let release = (): void => {};
  FakeEngine.nextGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => release();
}

beforeEach(() => {
  FakeEngine.instances = [];
  FakeEngine.nextGate = null;
  resetPageStorage();
  window.localStorage.clear();
});

afterEach(() => {
  resetPageStorage();
  window.localStorage.clear();
});

/** Lets pending microtasks and timers run, so the next channel can start. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('DeletionRunner.preview', () => {
  it('sums the totals for every channel in the config', async () => {
    const runner = makeRunner();
    const summary = await runner.preview('token', configFor([CHANNEL_A, CHANNEL_B, CHANNEL_C]));
    expect(FakeEngine.instances).toHaveLength(3);
    expect(summary.totalCount).toBe(12);
    expect(summary.channelCount).toBe(3);
    expect(summary.channelsCounted).toBe(3);
  });

  it('previews each channel with that channel in the options', async () => {
    const runner = makeRunner();
    await runner.preview('token', configFor([CHANNEL_A, CHANNEL_B]));
    expect(FakeEngine.instances.map((e) => e.options?.channelId)).toEqual([CHANNEL_A, CHANNEL_B]);
  });

  it('counts every channel of an eleven-channel run, not just the first ten', async () => {
    const channels = Array.from({ length: 11 }, (_, i) => `1111111111111111${String(10 + i)}`);
    const runner = makeRunner();
    const summary = await runner.preview('token', configFor(channels));
    expect(FakeEngine.instances).toHaveLength(11);
    expect(summary.channelsCounted).toBe(11);
    expect(summary.channelCount).toBe(11);
    expect(summary.totalCount).toBe(44);
  });

  it('propagates a preview failure so the caller can show it', async () => {
    const runner = new DeletionRunner({
      createApiClient: () => fakeClient(),
      createEngine: () => {
        const engine = new FakeEngine();
        engine.previewError = new Error('index still building');
        return engine;
      },
    });
    await expect(runner.preview('token', configFor([CHANNEL_A]))).rejects.toThrow(
      'index still building',
    );
  });

  it('refuses to preview while a run is active', async () => {
    const runner = makeRunner();
    const release = holdNextEngine();
    const started = runner.start('token', configFor([CHANNEL_A]));
    await Promise.resolve();
    await expect(runner.preview('token', configFor([CHANNEL_A]))).rejects.toThrow(
      /already running/,
    );
    release();
    await started;
  });
});

describe('DeletionRunner.start', () => {
  it('runs one engine per channel, sequentially, with that channel configured', async () => {
    const positions: number[] = [];
    const runner = makeRunner({
      onChannelStart: (position: { index: number; count: number }) => {
        positions.push(position.index);
        expect(position.count).toBe(3);
      },
    });
    await runner.start('token', configFor([CHANNEL_A, CHANNEL_B, CHANNEL_C]));

    const started = FakeEngine.instances.filter((e) => e.startCount > 0);
    expect(started).toHaveLength(3);
    expect(started.map((e) => e.options?.channelId)).toEqual([CHANNEL_A, CHANNEL_B, CHANNEL_C]);
    expect(positions).toEqual([1, 2, 3]);
  });

  it('aggregates counters across channels', async () => {
    const summaries: RunSummary[] = [];
    const runner = new DeletionRunner({
      createApiClient: () => fakeClient(),
      createEngine: () => {
        const engine = new FakeEngine();
        engine.script = [
          [message('a'), { status: 'deleted' }],
          [message('b'), { status: 'failed', reason: 'Missing Access' }],
          [message('c'), { status: 'skipped', reason: 'pinned' }],
        ];
        return engine;
      },
      callbacks: { onFinish: (summary) => summaries.push(summary) },
    });
    await runner.start('token', configFor([CHANNEL_A, CHANNEL_B]));
    expect(summaries[0]).toMatchObject({
      reason: 'completed',
      deleted: 2,
      failed: 2,
      skipped: 2,
      channelsCompleted: 2,
      channelCount: 2,
    });
  });

  it('reports the per-message outcome to the view', async () => {
    const seen: MessageOutcome[] = [];
    const runner = new DeletionRunner({
      createApiClient: () => fakeClient(),
      createEngine: () => {
        const engine = new FakeEngine();
        engine.script = [
          [message('a'), { status: 'deleted' }],
          [message('b'), { status: 'failed', reason: 'Missing Access' }],
        ];
        return engine;
      },
      callbacks: { onProgress: (_p, _m, outcome) => seen.push(outcome) },
    });
    await runner.start('token', configFor([CHANNEL_A]));
    expect(seen.map((o) => o.status)).toEqual(['deleted', 'failed']);
    expect(seen[1]?.reason).toBe('Missing Access');
  });

  it('ignores a second start while one is in flight', async () => {
    const runner = makeRunner();
    const first = runner.start('token', configFor([CHANNEL_A]));
    await runner.start('token', configFor([CHANNEL_B]));
    await first;
    expect(FakeEngine.instances.filter((e) => e.startCount > 0)).toHaveLength(1);
  });

  it('stops the current channel and does not advance to the next', async () => {
    let summary: RunSummary | null = null;
    const runner = new DeletionRunner({
      createApiClient: () => fakeClient(),
      createEngine: () => new FakeEngine(),
      callbacks: {
        onFinish: (result) => {
          summary = result;
        },
      },
    });
    const release = holdNextEngine();
    const running = runner.start('token', configFor([CHANNEL_A, CHANNEL_B]));
    await Promise.resolve();

    runner.stop();
    expect((FakeEngine.instances[0] as FakeEngine).stopCount).toBe(1);
    release();
    await running;

    expect(FakeEngine.instances.filter((e) => e.startCount > 0)).toHaveLength(1);
    expect((summary as unknown as RunSummary).reason).toBe('stopped');
    // The interrupted channel never finished, so it must not be counted.
    expect((summary as unknown as RunSummary).channelsCompleted).toBe(0);
  });

  it('reports an error reason when a channel throws', async () => {
    let summary: RunSummary | null = null;
    const runner = new DeletionRunner({
      createApiClient: () => fakeClient(),
      createEngine: () => {
        const engine = new FakeEngine();
        engine.startError = new Error('boom');
        return engine;
      },
      callbacks: {
        onFinish: (result) => {
          summary = result;
        },
      },
    });
    await runner.start('token', configFor([CHANNEL_A, CHANNEL_B]));
    expect((summary as unknown as RunSummary).reason).toBe('error');
    expect((summary as unknown as RunSummary).error?.message).toBe('boom');
    expect(FakeEngine.instances.filter((e) => e.startCount > 0)).toHaveLength(1);
  });

  it('hands a saved session to the first channel only', async () => {
    const saved: SavedProgress = {
      version: 2,
      runId: 'r1',
      authorId: 'author-1',
      channelId: CHANNEL_A,
      deletionOrder: 'newest',
      cursor: { maxId: '900' },
      deletedCount: 7,
      failedCount: 0,
      skippedCount: 0,
      alreadyGoneCount: 0,
      totalFound: 20,
      initialTotalFound: 20,
      timestamp: Date.now(),
    };
    const runner = makeRunner();
    await runner.start('token', configFor([CHANNEL_A, CHANNEL_B]), { resumeFrom: saved });
    const started = FakeEngine.instances.filter((e) => e.startCount > 0);
    expect(started[0]?.resumedFrom).toBe(saved);
    expect(started[1]?.resumedFrom).toBeNull();
  });

  it('gives every channel of one run the same run ID', async () => {
    const runner = makeRunner();
    await runner.start('token', configFor([CHANNEL_A, CHANNEL_B, CHANNEL_C]));
    const ids = FakeEngine.instances
      .filter((e) => e.startCount > 0)
      .map((e) => e.options?.runId ?? '');
    expect(ids[0]).toBeTruthy();
    expect(new Set(ids).size).toBe(1);
  });

  it('mints a different run ID for each fresh run', async () => {
    const runner = makeRunner();
    await runner.start('token', configFor([CHANNEL_A]));
    const first = FakeEngine.instances[0]?.options?.runId;
    FakeEngine.instances = [];
    await runner.start('token', configFor([CHANNEL_A]));
    expect(FakeEngine.instances[0]?.options?.runId).not.toBe(first);
  });

  it('reuses the run ID a resumed run was given', async () => {
    const runner = makeRunner();
    await runner.start('token', configFor([CHANNEL_A, CHANNEL_B]), { runId: 'resumed-run' });
    const started = FakeEngine.instances.filter((e) => e.startCount > 0);
    expect(started.map((e) => e.options?.runId)).toEqual(['resumed-run', 'resumed-run']);
    expect(loadRunPlan('author-1', 'resumed-run')).toBeNull();
  });

  it('reports the expected total on every progress tick', async () => {
    const seen: Array<number | null> = [];
    const runner = makeRunner({
      onProgress: (progress: RunProgress) => seen.push(progress.expectedTotal),
    });
    await runner.start('token', configFor([CHANNEL_A, CHANNEL_B]), { expectedTotal: 14 });
    expect(seen).toEqual([14, 14]);
  });

  it('reports no expected total when the run was never previewed', async () => {
    const seen: Array<number | null> = [];
    const runner = makeRunner({
      onProgress: (progress: RunProgress) => seen.push(progress.expectedTotal),
    });
    await runner.start('token', configFor([CHANNEL_A]));
    expect(seen).toEqual([null]);
  });

  it('pauses and resumes the live engine', async () => {
    const runner = makeRunner();
    const release = holdNextEngine();
    const running = runner.start('token', configFor([CHANNEL_A]));
    const engine = FakeEngine.instances[0] as FakeEngine;
    await Promise.resolve();

    runner.pause();
    expect(runner.isPaused()).toBe(true);
    runner.pause();
    expect(engine.pauseCount).toBe(1);
    runner.resume();
    expect(runner.isPaused()).toBe(false);
    expect(engine.resumeCount).toBe(1);

    release();
    await running;
    expect(runner.isActive()).toBe(false);
  });

  it('stops the engine on pagehide and removes the listener afterwards', async () => {
    const runner = makeRunner();
    const release = holdNextEngine();
    const running = runner.start('token', configFor([CHANNEL_A]));
    const engine = FakeEngine.instances[0] as FakeEngine;
    await Promise.resolve();

    window.dispatchEvent(new Event('pagehide'));
    expect(engine.stopCount).toBe(1);

    release();
    await running;

    window.dispatchEvent(new Event('pagehide'));
    expect(engine.stopCount).toBe(1);
  });

  it('is a no-op to pause, resume, stop or dispose while idle', () => {
    const runner = makeRunner();
    expect(() => {
      runner.pause();
      runner.resume();
      runner.stop();
      runner.dispose();
    }).not.toThrow();
    expect(runner.getTotals()).toEqual({ deleted: 0, failed: 0, skipped: 0, alreadyGone: 0 });
    expect(runner.getPosition()).toBeNull();
  });
});

describe('DeletionRunner run plans', () => {
  /** The run ID every engine of the last run was configured with. */
  function runIdOf(engines: FakeEngine[] = FakeEngine.instances): string {
    return engines.find((engine) => engine.options?.runId)?.options?.runId ?? '';
  }

  /**
   * Runs three channels and stops during the second, which is what a user
   * closing the tab mid-run leaves behind.
   */
  async function stopInSecondChannel(): Promise<{ summary: RunSummary | null; runId: string }> {
    let summary: RunSummary | null = null;
    let created = 0;
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const runner = new DeletionRunner({
      createApiClient: () => fakeClient(),
      createEngine: () => {
        created++;
        const engine = new FakeEngine();
        if (created === 2) {
          engine.gate = gate;
        }
        return engine;
      },
      callbacks: {
        onFinish: (result) => {
          summary = result;
        },
      },
    });

    const running = runner.start('token', configFor([CHANNEL_A, CHANNEL_B, CHANNEL_C]), {
      expectedTotal: 30,
    });
    await settle();
    expect(FakeEngine.instances).toHaveLength(2);

    runner.stop();
    release();
    await running;
    return { summary, runId: runIdOf() };
  }

  it('keeps a plan naming every channel a stopped run never reached', async () => {
    const { summary, runId } = await stopInSecondChannel();
    expect((summary as unknown as RunSummary).reason).toBe('stopped');

    const plan = loadRunPlan('author-1', runId) as RunPlan;
    expect(plan).not.toBeNull();
    expect(plan.runId).toBe(runId);
    expect(plan.channelIds).toEqual([CHANNEL_A, CHANNEL_B, CHANNEL_C]);
    expect(plan.index).toBe(1);
    // Only the first channel finished, so only its work is banked.
    expect(plan.completedTotals).toEqual({ deleted: 1, failed: 0, skipped: 0, alreadyGone: 0 });
    expect(plan.scope).toBe('specific');
    // The aggregate the review step showed outlives the interruption.
    expect(plan.expectedTotal).toBe(30);
  });

  it('files the plan under the author and the run', async () => {
    const { runId } = await stopInSecondChannel();
    expect(window.localStorage.getItem(`detcord_runplan:v2:author-1:${runId}`)).not.toBeNull();
  });

  it('carries the banked counters of earlier channels into a resumed run', async () => {
    const { runId } = await stopInSecondChannel();
    const plan = loadRunPlan('author-1', runId) as RunPlan;

    FakeEngine.instances = [];
    let summary: RunSummary | null = null;
    const runner = makeRunner({
      onFinish: (result: RunSummary) => {
        summary = result;
      },
    });
    await runner.start('token', configFor([CHANNEL_B, CHANNEL_C]), {
      baseTotals: plan.completedTotals,
      runId,
    });

    // One from the interrupted channel plus one each for B and C.
    expect((summary as unknown as RunSummary).deleted).toBe(3);
    expect((summary as unknown as RunSummary).reason).toBe('completed');
  });

  it('removes the plan when the whole run completes', async () => {
    const runner = makeRunner();
    await runner.start('token', configFor([CHANNEL_A, CHANNEL_B]));
    expect(loadRunPlan('author-1', runIdOf())).toBeNull();
  });

  it('keeps the plan when the run ends in an error, as the checkpoint survives', async () => {
    const runner = new DeletionRunner({
      createApiClient: () => fakeClient(),
      createEngine: () => {
        const engine = new FakeEngine();
        engine.startError = new Error('boom');
        return engine;
      },
    });
    await runner.start('token', configFor([CHANNEL_A, CHANNEL_B, CHANNEL_C]), {
      expectedTotal: 12,
    });

    const plan = loadRunPlan('author-1', runIdOf()) as RunPlan;
    expect(plan).not.toBeNull();
    // The channels queued behind the failure are still there to resume into.
    expect(plan.channelIds).toEqual([CHANNEL_A, CHANNEL_B, CHANNEL_C]);
    expect(plan.index).toBe(0);
    expect(plan.expectedTotal).toBe(12);
  });

  it('leaves the plan of an earlier run alone when a second run starts', async () => {
    const { runId: first } = await stopInSecondChannel();
    FakeEngine.instances = [];

    const runner = makeRunner();
    const release = holdNextEngine();
    const running = runner.start('token', configFor([CHANNEL_C]));
    await Promise.resolve();

    const second = runIdOf();
    expect(second).not.toBe(first);
    expect(loadRunPlan('author-1', second)?.channelIds).toEqual([CHANNEL_C]);
    // The stopped run can still be resumed into the channels it never reached.
    const earlier = loadRunPlan('author-1', first) as RunPlan;
    expect(earlier.channelIds).toEqual([CHANNEL_A, CHANNEL_B, CHANNEL_C]);
    expect(earlier.index).toBe(1);
    expect(earlier.completedTotals.deleted).toBe(1);

    release();
    await running;
    // Completing the second run clears only its own plan.
    expect(loadRunPlan('author-1', second)).toBeNull();
    expect(loadRunPlan('author-1', first)).not.toBeNull();
  });

  it('discards a v1 plan for the author rather than reading it', async () => {
    window.localStorage.setItem(
      'detcord_runplan:v1:author-1',
      JSON.stringify({ version: 1, authorId: 'author-1', channelIds: [CHANNEL_C] }),
    );
    const runner = makeRunner();
    await runner.start('token', configFor([CHANNEL_A]));
    expect(window.localStorage.getItem('detcord_runplan:v1:author-1')).toBeNull();
  });
});
