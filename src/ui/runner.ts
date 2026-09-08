/**
 * Deletion runner.
 *
 * Owns the one and only live deletion engine. Nothing else in the UI creates,
 * configures or starts an engine, which is what guarantees a double click can
 * never spawn a second run. The runner also walks a multi-channel run through
 * its channels one at a time and aggregates the counters across them.
 */

import type {
  ApiClientFactory,
  DeletionEngineState,
  DeletionEngineStats,
  DeletionStopReason,
  DiscordMessage,
  EngineFactory,
  EnginePort,
  MessageOutcome,
  PreviewResult,
  RateLimitChangeInfo,
  SavedProgress,
  StopResult,
} from './ports';
import { createRunId } from './ports';
import { engineOptionsFor, type RunConfig } from './run-config';
import { clearRunPlan, runPlanFor, saveRunPlan } from './run-plan';

/** Cumulative message counters for a run. */
export interface RunTotals {
  deleted: number;
  failed: number;
  skipped: number;
  alreadyGone: number;
}

/** Which channel of a multi-channel run is being processed. */
export interface ChannelPosition {
  /** 1-based index of the channel currently being processed. */
  index: number;
  /** Total number of channels in this run. */
  count: number;
  channelId: string;
}

/** A single progress tick, already aggregated across channels. */
export interface RunProgress {
  position: ChannelPosition;
  state: DeletionEngineState;
  stats: DeletionEngineStats;
  totals: RunTotals;
  /**
   * Messages the review step counted across every channel of this run.
   *
   * The engine state only knows the channel in flight, so this is the only
   * figure a multi-channel run can measure its aggregate counters against.
   * Null for a checkpoint resume, which never had a review step.
   */
  expectedTotal: number | null;
}

/** How a run ended. */
export interface RunSummary extends RunTotals {
  reason: 'completed' | 'stopped' | 'error';
  error: Error | null;
  durationMs: number;
  channelsCompleted: number;
  channelCount: number;
}

/** Aggregated preview across every channel a run would visit. */
export interface PreviewSummary {
  totalCount: number;
  filtersApplied: boolean;
  estimatedTimeMs: number;
  sampleMessages: DiscordMessage[];
  channelsCounted: number;
  channelCount: number;
}

/** Events the runner reports back to the view. */
export interface RunnerCallbacks {
  onChannelStart?: (position: ChannelPosition) => void;
  onProgress?: (progress: RunProgress, message: DiscordMessage, outcome: MessageOutcome) => void;
  onStatus?: (status: string | undefined) => void;
  onRateLimitChange?: (info: RateLimitChangeInfo) => void;
  onError?: (error: Error) => void;
  onFinish?: (summary: RunSummary) => void;
}

/** Construction dependencies. */
export interface RunnerOptions {
  createApiClient: ApiClientFactory;
  createEngine: EngineFactory;
  callbacks?: RunnerCallbacks;
}

/** Everything a run needs beyond its token and config. */
export interface RunStartOptions {
  /** Checkpoint to continue from, applied to the first channel only. */
  resumeFrom?: SavedProgress | undefined;
  /** Counters carried over from earlier legs of a resumed run. */
  baseTotals?: RunTotals | undefined;
  /** Aggregate the review step counted, or null when there was none. */
  expectedTotal?: number | null | undefined;
  /**
   * Identifier to reuse, so a resumed run keeps the checkpoint's run ID and
   * stays paired with its own plan. A fresh run mints one.
   */
  runId?: string | undefined;
}

const EMPTY_TOTALS: RunTotals = { deleted: 0, failed: 0, skipped: 0, alreadyGone: 0 };

function stateTotals(state: DeletionEngineState): RunTotals {
  return {
    deleted: state.deletedCount ?? 0,
    failed: state.failedCount ?? 0,
    skipped: state.skippedCount ?? 0,
    alreadyGone: state.alreadyGoneCount ?? 0,
  };
}

function addTotals(a: RunTotals, b: RunTotals): RunTotals {
  return {
    deleted: a.deleted + b.deleted,
    failed: a.failed + b.failed,
    skipped: a.skipped + b.skipped,
    alreadyGone: a.alreadyGone + b.alreadyGone,
  };
}

/**
 * Sequentially drives one deletion engine per channel in a run.
 */
export class DeletionRunner {
  private readonly createApiClient: ApiClientFactory;
  private readonly createEngine: EngineFactory;
  private callbacks: RunnerCallbacks;

  private engine: EnginePort | null = null;
  private active = false;
  private paused = false;
  private stopRequested = false;
  private lastError: Error | null = null;
  private baseTotals: RunTotals = EMPTY_TOTALS;
  private liveTotals: RunTotals = EMPTY_TOTALS;
  private position: ChannelPosition | null = null;
  private channelsCompleted = 0;
  private legReason: DeletionStopReason | null = null;
  private planConfig: RunConfig | null = null;
  private runId = '';
  private expectedTotal: number | null = null;
  private startedAt = 0;
  private pageHideHandler: (() => void) | null = null;

  constructor(options: RunnerOptions) {
    this.createApiClient = options.createApiClient;
    this.createEngine = options.createEngine;
    this.callbacks = options.callbacks ?? {};
  }

  /**
   * Replaces the callback set.
   *
   * @param callbacks - New callbacks
   */
  setCallbacks(callbacks: RunnerCallbacks): void {
    this.callbacks = callbacks;
  }

  /** Whether a run is currently in flight. */
  isActive(): boolean {
    return this.active;
  }

  /** Whether the active run is paused. */
  isPaused(): boolean {
    return this.paused;
  }

  /** Cumulative counters for the run so far. */
  getTotals(): RunTotals {
    return this.active ? addTotals(this.baseTotals, this.liveTotals) : this.baseTotals;
  }

  /** Which channel is being processed, or null when idle. */
  getPosition(): ChannelPosition | null {
    return this.position;
  }

  /**
   * Counts the messages a run would delete, without deleting anything.
   *
   * Every channel the run would visit is counted: a channel that is not
   * previewed must never be swept.
   *
   * @param token - Discord auth token
   * @param config - The immutable config the run will use
   * @returns Aggregated preview numbers
   * @throws When a search fails, so the caller can surface the message
   */
  async preview(token: string, config: RunConfig): Promise<PreviewSummary> {
    if (this.active) {
      throw new Error('A deletion is already running.');
    }

    const client = this.createApiClient(token);
    const channels = config.channelIds;

    let totalCount = 0;
    let estimatedTimeMs = 0;
    let filtersApplied = false;
    let sampleMessages: DiscordMessage[] = [];

    for (const channelId of channels) {
      const engine = this.createEngine(client);
      engine.configure(engineOptionsFor(config, channelId, token));
      const result: PreviewResult = await engine.preview();
      totalCount += result.totalCount ?? 0;
      estimatedTimeMs += result.estimatedTimeMs ?? 0;
      filtersApplied = filtersApplied || Boolean(result.filtersApplied);
      if (sampleMessages.length === 0) {
        sampleMessages = result.sampleMessages ?? [];
      }
    }

    return {
      totalCount,
      filtersApplied,
      estimatedTimeMs,
      sampleMessages,
      channelsCounted: channels.length,
      channelCount: channels.length,
    };
  }

  /**
   * Runs the deletion, one channel at a time.
   *
   * Every channel of the run shares one run ID, which is written into both the
   * engine's checkpoints and the run plan. A plan is persisted for the whole
   * channel list, so an interruption part-way through a multi-channel run can
   * be resumed into the channels that never ran rather than the interrupted
   * one alone - and only ever by the checkpoint of this very run.
   *
   * @param token - Discord auth token
   * @param config - The immutable config produced at the review step
   * @param options - Checkpoint, banked counters, expected total and run ID
   */
  async start(token: string, config: RunConfig, options: RunStartOptions = {}): Promise<void> {
    if (this.active) {
      return;
    }

    this.active = true;
    this.paused = false;
    this.stopRequested = false;
    this.lastError = null;
    this.baseTotals = options.baseTotals ? { ...options.baseTotals } : EMPTY_TOTALS;
    this.liveTotals = EMPTY_TOTALS;
    this.channelsCompleted = 0;
    this.startedAt = Date.now();
    this.planConfig = config;
    this.runId = options.runId ?? createRunId();
    this.expectedTotal = options.expectedTotal ?? null;
    this.installPageHideHandler();

    const client = this.createApiClient(token);
    const channelCount = config.channelIds.length;
    this.writePlan(0);

    try {
      for (let index = 0; index < channelCount; index++) {
        if (this.stopRequested) {
          break;
        }
        const channelId = config.channelIds[index] as string;
        this.position = { index: index + 1, count: channelCount, channelId };
        this.callbacks.onChannelStart?.(this.position);

        await this.runChannel(
          client,
          token,
          config,
          channelId,
          index === 0 ? options.resumeFrom : undefined,
        );

        if (this.lastError) {
          break;
        }
        if (this.legReason === 'completed') {
          this.channelsCompleted++;
          this.writePlan(Math.min(index + 1, channelCount - 1));
        }
      }
    } finally {
      this.finish(channelCount);
    }
  }

  /**
   * Persists the plan for the run in flight, with the counters banked so far.
   *
   * @param index - Index of the channel the run has reached
   */
  private writePlan(index: number): void {
    const config = this.planConfig;
    if (!config) {
      return;
    }
    saveRunPlan(
      runPlanFor(config, {
        runId: this.runId,
        index,
        completedTotals: this.baseTotals,
        expectedTotal: this.expectedTotal,
      }),
    );
  }

  private async runChannel(
    client: ReturnType<ApiClientFactory>,
    token: string,
    config: RunConfig,
    channelId: string,
    resumeFrom: SavedProgress | undefined,
  ): Promise<void> {
    const engine = this.createEngine(client);
    this.engine = engine;
    this.liveTotals = EMPTY_TOTALS;
    this.legReason = null;

    engine.configure(engineOptionsFor(config, channelId, token, this.runId));
    engine.setCallbacks({
      onProgress: (state, stats, message, outcome) =>
        this.handleProgress(state, stats, message, outcome),
      onStatus: (status) => this.callbacks.onStatus?.(status),
      onRateLimitChange: (info) => this.callbacks.onRateLimitChange?.(info),
      onError: (error) => this.handleError(error),
      onStop: (state, _stats, result) => this.handleChannelStop(state, result),
    });

    if (resumeFrom) {
      engine.resumeFromSaved(resumeFrom);
    }

    try {
      await engine.start();
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.baseTotals = addTotals(this.baseTotals, this.liveTotals);
      this.liveTotals = EMPTY_TOTALS;
      this.engine = null;
    }
  }

  private handleProgress(
    state: DeletionEngineState,
    stats: DeletionEngineStats,
    message: DiscordMessage,
    outcome: MessageOutcome,
  ): void {
    this.liveTotals = stateTotals(state);
    const position = this.position;
    if (!position) {
      return;
    }
    this.callbacks.onProgress?.(
      {
        position,
        state,
        stats,
        totals: addTotals(this.baseTotals, this.liveTotals),
        expectedTotal: this.expectedTotal,
      },
      message,
      outcome ?? { status: 'deleted' },
    );
  }

  private handleChannelStop(state: DeletionEngineState, result: StopResult | undefined): void {
    this.liveTotals = stateTotals(state);
    this.legReason = result?.reason ?? null;
    if (result?.reason === 'stopped') {
      this.stopRequested = true;
    }
  }

  private handleError(error: Error): void {
    this.lastError = error;
    this.callbacks.onError?.(error);
  }

  private finish(channelCount: number): void {
    const totals = addTotals(this.baseTotals, EMPTY_TOTALS);
    const reason: RunSummary['reason'] = this.lastError
      ? 'error'
      : this.stopRequested
        ? 'stopped'
        : 'completed';

    // Only a run that swept every channel has nothing left to resume. A
    // stopped run keeps its plan, and so does one an error ended: the engine
    // leaves a checkpoint behind in both cases, and without the plan that
    // checkpoint would resume the interrupted channel alone, losing the
    // channels still queued and the counters banked from earlier ones.
    if (reason === 'completed' && this.planConfig) {
      clearRunPlan(this.planConfig.authorId, this.runId);
    }

    this.active = false;
    this.paused = false;
    this.engine = null;
    this.position = null;
    this.planConfig = null;
    this.legReason = null;
    this.removePageHideHandler();

    this.callbacks.onFinish?.({
      ...totals,
      reason,
      error: this.lastError,
      durationMs: Date.now() - this.startedAt,
      channelsCompleted: this.channelsCompleted,
      channelCount,
    });
  }

  /** Pauses the active run. */
  pause(): void {
    if (!this.active || this.paused) {
      return;
    }
    this.paused = true;
    this.engine?.pause();
  }

  /** Resumes a paused run. */
  resume(): void {
    if (!this.active || !this.paused) {
      return;
    }
    this.paused = false;
    this.engine?.resume();
  }

  /** Stops the active run and prevents it advancing to further channels. */
  stop(): void {
    if (!this.active) {
      return;
    }
    this.stopRequested = true;
    if (this.paused) {
      this.paused = false;
      this.engine?.resume();
    }
    this.engine?.stop();
  }

  /** Stops any run and releases listeners. */
  dispose(): void {
    this.stop();
    this.removePageHideHandler();
    this.engine = null;
  }

  private installPageHideHandler(): void {
    if (this.pageHideHandler || typeof window === 'undefined') {
      return;
    }
    this.pageHideHandler = () => {
      this.engine?.stop();
    };
    window.addEventListener('pagehide', this.pageHideHandler);
  }

  private removePageHideHandler(): void {
    if (this.pageHideHandler && typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.pageHideHandler);
    }
    this.pageHideHandler = null;
  }
}
