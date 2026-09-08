/**
 * DeletionEngine - orchestrates bulk message deletion for Detcord.
 *
 * The engine owns the whole run: pagination, rate-limit handling, retries,
 * client-side filtering, progress reporting and resume support. Every failure
 * reaching it is a {@link DiscordApiError}, so decisions are made on `code`
 * rather than on ad-hoc status fields.
 */

import { dateToSnowflake, snowflakeToDate } from '../utils/helpers';
import { safeRegexTest, validateRegex } from '../utils/validators';
import type {
  DiscordMessage as ApiDiscordMessage,
  RateLimitInfo as ApiRateLimitInfo,
  SearchParams as ApiSearchParams,
  SearchResponse as ApiSearchResponse,
} from './discord-api';
import { DiscordApiError, type DiscordApiErrorCode } from './errors';
import {
  clearProgress,
  findResumableSession,
  type SavedFilters,
  type SavedProgress,
  saveProgress,
  shouldSaveProgress,
  targetKeyFor,
} from './persistence';

// =============================================================================
// Types and Interfaces
// =============================================================================

/** Discord message structure, re-exported so consumers have one source. */
export type DiscordMessage = ApiDiscordMessage;

/** Search response from Discord, re-exported for consumers. */
export type SearchResponse = ApiSearchResponse;

/** Rate limit information, re-exported for consumers. */
export type RateLimitInfo = ApiRateLimitInfo;

/** Search parameters accepted by the API client. */
export type SearchParams = ApiSearchParams;

/** What happened to a single message. */
export type MessageOutcomeStatus = 'deleted' | 'already_gone' | 'skipped' | 'failed';

/** Result of processing one message. */
export interface MessageOutcome {
  /** Terminal status for this message. */
  status: MessageOutcomeStatus;
  /** Human-readable explanation, mainly for skips and failures. */
  reason?: string;
  /** API error code when the outcome came from a failed request. */
  code?: DiscordApiErrorCode;
}

/** Why a run ended. */
export type DeletionStopReason = 'completed' | 'stopped' | 'error';

/**
 * API client interface - dependency injection for testability.
 *
 * Deliberately narrower than the concrete `DiscordApiClient`: the engine never
 * needs `getCurrentUser` or channel listings.
 */
export interface DiscordApiClient {
  /** Searches messages; throws a {@link DiscordApiError} on any failure. */
  searchMessages(params: SearchParams, signal?: AbortSignal): Promise<SearchResponse>;
  /** Deletes one message; resolves `already_gone` for a 404. */
  deleteMessage(
    channelId: string,
    messageId: string,
    signal?: AbortSignal,
  ): Promise<'deleted' | 'already_gone'>;
  /** Latest rate limit headers, or null when none have been seen. */
  getRateLimitInfo(): RateLimitInfo | null;
}

/** Deletion order determines which messages are deleted first. */
export type DeletionOrder = 'newest' | 'oldest';

/** Configuration options for the deletion engine. */
export interface DeletionEngineOptions {
  /**
   * Identifier for the run. A multi-channel runner passes one id to every
   * channel's engine so the checkpoint and the run plan can be correlated;
   * when absent the engine mints its own.
   */
  runId?: string;
  /** Discord auth token. */
  authToken: string;
  /** ID of the message author (the current user). */
  authorId: string;
  /** Guild (server) ID - set for a server-wide run. */
  guildId?: string;
  /** Channel ID - required, also used for DMs. */
  channelId: string;
  /** Minimum message ID ("after" date filter). */
  minId?: string;
  /** Maximum message ID ("before" date filter). */
  maxId?: string;
  /** Text content filter. */
  content?: string;
  /** Filter for messages containing links. */
  hasLink?: boolean;
  /** Filter for messages containing file attachments. */
  hasFile?: boolean;
  /** Whether to include pinned messages (default: false). */
  includePinned?: boolean;
  /** Client-side regex pattern for content matching. */
  pattern?: string;
  /** Delay between search requests in ms (default: 10000). */
  searchDelay?: number;
  /** Delay between delete requests in ms (default: 1000). */
  deleteDelay?: number;
  /** Maximum retries for recoverable failures (default: 3). */
  maxRetries?: number;
  /** Order to delete messages: 'newest' (default) or 'oldest' first. */
  deletionOrder?: DeletionOrder;
}

/** Current state of the deletion engine. */
export interface DeletionEngineState {
  /** Whether the engine is currently running. */
  running: boolean;
  /** Whether the engine is paused. */
  paused: boolean;
  /** Messages successfully deleted. */
  deletedCount: number;
  /** Messages that failed to delete. */
  failedCount: number;
  /** Messages skipped by a filter, ownership guard or 403. */
  skippedCount: number;
  /** Messages that had already been deleted when we tried. */
  alreadyGoneCount: number;
  /** Latest `total_results` reported by search. */
  totalFound: number;
  /** `total_results` of the first search of the run. */
  initialTotalFound: number;
  /** Retained for UI compatibility; the engine paginates by cursor, not offset. */
  currentOffset: number;
  /** Current status message for UI feedback. */
  status?: string | undefined;
}

/** Statistics for the deletion operation. */
export interface DeletionEngineStats {
  /** Timestamp when deletion started. */
  startTime: number;
  /** Number of times we were rate limited. */
  throttledCount: number;
  /** Total time spent waiting on rate limits (ms). */
  throttledTime: number;
  /** Rolling average response time for API calls (ms). */
  averagePing: number;
  /** Estimated time remaining in ms (-1 if unknown). */
  estimatedTimeRemaining: number;
}

/** Rate limit change information for the UI. */
export interface RateLimitChangeInfo {
  /** Whether the engine is currently throttled. */
  isThrottled: boolean;
  /** Current delay between delete requests in ms. */
  currentDelay: number;
}

/** Event callbacks for engine lifecycle. */
export interface DeletionEngineCallbacks {
  /** Called when deletion starts. */
  onStart?: (state: DeletionEngineState, stats: DeletionEngineStats) => void;
  /** Called for every processed message, including skips and failures. */
  onProgress?: (
    state: DeletionEngineState,
    stats: DeletionEngineStats,
    message: DiscordMessage,
    outcome: MessageOutcome,
  ) => void;
  /** Called when the run ends, with the reason it ended. */
  onStop?: (
    state: DeletionEngineState,
    stats: DeletionEngineStats,
    result: { reason: DeletionStopReason },
  ) => void;
  /** Called when an error aborts the run. */
  onError?: (error: Error) => void;
  /** Called when rate limit state changes. */
  onRateLimitChange?: (info: RateLimitChangeInfo) => void;
  /** Called when the status message changes during long operations. */
  onStatus?: (status: string | undefined) => void;
}

/** Result of {@link DeletionEngine.preview}. */
export interface PreviewResult {
  /** Server-reported total for the search, before client-side filtering. */
  totalCount: number;
  /** Up to ten messages that would be deleted. */
  sampleMessages: DiscordMessage[];
  /** Rough estimate of the run duration in ms. */
  estimatedTimeMs: number;
  /** True when client-side filters mean `totalCount` is an upper bound. */
  filtersApplied: boolean;
}

/** A snowflake range for one search. */
interface SearchRange {
  minId?: string | undefined;
  maxId?: string | undefined;
}

/** Retry counters for a single search or delete operation. */
interface RetryBudget {
  /** Consecutive network/server backoff attempts. */
  backoff: number;
  /** Consecutive 202 indexing waits. */
  indexing: number;
  /** Consecutive 429 waits. */
  rateLimits: number;
}

/** State carried from a saved session into the next run. */
interface ResumedRunState {
  runId: string;
  deletedCount: number;
  failedCount: number;
  skippedCount: number;
  alreadyGoneCount: number;
  totalFound: number;
  initialTotalFound: number;
  cursor: SavedProgress['cursor'];
}

// =============================================================================
// Constants
// =============================================================================

/** Default delay between search API calls in ms. */
const DEFAULT_SEARCH_DELAY = 10000;

/** Default delay between delete API calls in ms. */
const DEFAULT_DELETE_DELAY = 1000;

/** Default maximum retries for recoverable failures. */
const DEFAULT_MAX_RETRIES = 3;

/** Number of messages per search page (Discord's limit). */
const MESSAGES_PER_PAGE = 25;

/** Message types that a user is allowed to delete. */
const DELETABLE_MESSAGE_TYPES = new Set([
  0, // DEFAULT - regular user message
  6, // CHANNEL_PINNED_MESSAGE
  7, // USER_JOIN
  8, // GUILD_BOOST
  9, // GUILD_BOOST_TIER_1
  10, // GUILD_BOOST_TIER_2
  11, // GUILD_BOOST_TIER_3
  12, // CHANNEL_FOLLOW_ADD
  14, // GUILD_DISCOVERY_DISQUALIFIED
  15, // GUILD_DISCOVERY_REQUALIFIED
  16, // GUILD_DISCOVERY_GRACE_PERIOD_INITIAL_WARNING
  17, // GUILD_DISCOVERY_GRACE_PERIOD_FINAL_WARNING
  18, // THREAD_CREATED
  19, // REPLY
  20, // CHAT_INPUT_COMMAND
  21, // THREAD_STARTER_MESSAGE
]);

/** Consecutive empty pages tolerated before assuming the range is exhausted. */
const MAX_EMPTY_PAGE_RETRIES = 5;

/** Multiplier applied to the search delay for each consecutive empty page. */
const EMPTY_PAGE_BACKOFF_MULTIPLIER = 1.3;

/** Time window size for oldest-first deletion (one week). */
const TIME_WINDOW_SIZE_MS = 7 * 24 * 60 * 60 * 1000;

/** Maximum bisection steps when hunting for the oldest message. */
const MAX_BISECTION_STEPS = 20;

/** Earliest date a Discord message can carry. */
const DISCORD_EPOCH_ISO = '2015-01-01T00:00:00.000Z';

/** Consecutive 429s tolerated before a request is treated as failed. */
const MAX_CONSECUTIVE_RATE_LIMITS = 10;

/** Indexing (202) waits allowed, as a multiple of `maxRetries`. */
const INDEXING_RETRY_MULTIPLIER = 3;

/** First step of the exponential backoff for network and server errors. */
const BACKOFF_BASE_MS = 1000;

/** Ceiling for the exponential backoff. */
const BACKOFF_CAP_MS = 30000;

/** Fallback wait when a 429 carries no `retry_after`. */
const DEFAULT_RETRY_AFTER_SECONDS = 1;

/** Minimum jitter added to a rate limit wait. */
const RATE_LIMIT_JITTER_MIN_MS = 50;

/** Maximum jitter added to a rate limit wait. */
const RATE_LIMIT_JITTER_MAX_MS = 250;

/** Minimum wait after a global rate limit. */
const GLOBAL_RATE_LIMIT_FLOOR_MS = 1000;

/** Ceiling for a proactive wait driven by `X-RateLimit-Remaining: 0`. */
const MAX_HEADER_WAIT_MS = 60000;

/** Consecutive successes needed before the delete delay is reduced. */
const THROTTLE_RECOVERY_THRESHOLD = 5;

/** Fraction of the current delay given back after each run of successes. */
const THROTTLE_RECOVERY_PERCENTAGE = 0.1;

/** Fraction of the gap toward `retry_after` added when throttled. */
const THROTTLE_INCREASE_PERCENTAGE = 0.5;

/** Baseline delay between delete requests in ms. */
const BASELINE_DELETE_DELAY = 1000;

/** Status shown while Discord builds its search index. */
const INDEXING_STATUS = "Waiting for Discord's search index…";

// =============================================================================
// Module helpers
// =============================================================================

/**
 * Picks the searched-for message out of a search result group.
 *
 * Discord returns each hit with surrounding context; only the member flagged
 * `hit` is ours to delete. `group[0]` is a last resort for older payloads.
 */
function pickHit(group: DiscordMessage[]): DiscordMessage | undefined {
  return group.find((message) => message.hit === true) ?? group[0];
}

/** Flattens a search response into one message per result group. */
function extractHits(response: SearchResponse): DiscordMessage[] {
  const messages: DiscordMessage[] = [];
  for (const group of response.messages ?? []) {
    const hit = pickHit(group);
    if (hit) {
      messages.push(hit);
    }
  }
  return messages;
}

/** Smallest snowflake in a page, or null when the page is empty. */
function minMessageId(messages: DiscordMessage[]): bigint | null {
  let smallest: bigint | null = null;
  for (const message of messages) {
    const id = BigInt(message.id);
    if (smallest === null || id < smallest) {
      smallest = id;
    }
  }
  return smallest;
}

/** Returns the later of two optional snowflakes. */
function maxSnowflake(a: string | undefined, b: string | undefined): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return BigInt(a) > BigInt(b) ? a : b;
}

/** Returns the earlier of two optional snowflakes. */
function minSnowflake(a: string | undefined, b: string | undefined): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return BigInt(a) < BigInt(b) ? a : b;
}

/** Sorts a copy of the page oldest-first. */
function sortByIdAscending(messages: DiscordMessage[]): DiscordMessage[] {
  return [...messages].sort((a, b) => {
    const left = BigInt(a.id);
    const right = BigInt(b.id);
    if (left < right) return -1;
    return left > right ? 1 : 0;
  });
}

/** Exponential backoff for network and server errors: 1s, 2s, 4s, capped. */
function backoffDelayMs(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CAP_MS);
}

/** Wait for a 429, honouring `retry_after`, the global floor and jitter. */
function rateLimitWaitMs(error: DiscordApiError): number {
  const base = (error.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS) * 1000;
  const floor = error.global ? GLOBAL_RATE_LIMIT_FLOOR_MS : 0;
  const jitterRange = RATE_LIMIT_JITTER_MAX_MS - RATE_LIMIT_JITTER_MIN_MS;
  const jitter = RATE_LIMIT_JITTER_MIN_MS + Math.random() * jitterRange;
  return Math.round(Math.max(base, floor) + jitter);
}

/** Builds a `failed` outcome from an API error. */
function failureOutcome(error: DiscordApiError): MessageOutcome {
  return { status: 'failed', reason: error.message, code: error.code };
}

/**
 * Whether a failure is this run's own Stop cancelling an in-flight request.
 *
 * An abort is neither an error nor something to retry: the caller asked the
 * run to end, so the loops unwind exactly as they do for any other Stop.
 */
function isAbortedFailure(error: unknown): boolean {
  return DiscordApiError.is(error) && error.code === 'ABORTED';
}

/** Generates an identifier unique enough to correlate a resumed run. */
export function createRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Copies saved filters onto a configuration object. */
function applySavedFilters(
  target: Partial<DeletionEngineOptions>,
  filters: SavedFilters | undefined,
): void {
  if (!filters) return;
  if (filters.content !== undefined) target.content = filters.content;
  if (filters.hasLink !== undefined) target.hasLink = filters.hasLink;
  if (filters.hasFile !== undefined) target.hasFile = filters.hasFile;
  if (filters.includePinned !== undefined) target.includePinned = filters.includePinned;
  if (filters.pattern !== undefined) target.pattern = filters.pattern;
  if (filters.minId !== undefined) target.minId = filters.minId;
  if (filters.maxId !== undefined) target.maxId = filters.maxId;
}

// =============================================================================
// DeletionEngine
// =============================================================================

/**
 * Orchestrates the message deletion process.
 *
 * The engine is UI-agnostic: it reports through callbacks and is driven with
 * `configure()`, `start()`, `pause()`, `resume()` and `stop()`.
 */
export class DeletionEngine {
  private apiClient: DiscordApiClient;
  private options: DeletionEngineOptions | null = null;
  private callbacks: DeletionEngineCallbacks = {};

  private state: DeletionEngineState = createInitialState();
  private stats: DeletionEngineStats = createInitialStats();

  private pingHistory: number[] = [];
  private stopRequested = false;
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;
  private compiledPattern: RegExp | null = null;
  private attemptedMessageIds: Set<string> = new Set();
  private abortController: AbortController | null = null;

  // Rate limit smoothing state
  private consecutiveSuccesses = 0;
  private currentDelay: number = BASELINE_DELETE_DELAY;
  private readonly baselineDelay = BASELINE_DELETE_DELAY;
  private isThrottled = false;

  // Cursor and persistence state
  private cursorMaxId: string | undefined;
  private lastProcessedId: string | null = null;
  private totalsInitialised = false;
  private runId = '';
  private resumedState: ResumedRunState | null = null;

  /**
   * Creates a new DeletionEngine.
   *
   * @param apiClient - The Discord API client used for every request
   */
  constructor(apiClient: DiscordApiClient) {
    this.apiClient = apiClient;
  }

  // =========================================================================
  // Configuration
  // =========================================================================

  /**
   * Merges options into the engine configuration.
   *
   * @param options - Partial options to merge with the existing config
   * @throws Error when the engine is running or the regex pattern is invalid
   */
  configure(options: Partial<DeletionEngineOptions>): void {
    if (this.state.running) {
      throw new Error('Cannot configure while running');
    }

    this.options = {
      ...(this.options ?? ({} as DeletionEngineOptions)),
      ...options,
    } as DeletionEngineOptions;

    if (options.pattern !== undefined) {
      this.compiledPattern = compilePattern(options.pattern);
    }
  }

  /**
   * Sets event callbacks for the engine.
   *
   * @param callbacks - Callback functions for engine events
   */
  setCallbacks(callbacks: DeletionEngineCallbacks): void {
    this.callbacks = callbacks;
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Runs the deletion until it completes, is stopped, or fails.
   *
   * Counters and cursor restored by {@link resumeFromSaved} are preserved.
   *
   * @throws Error when the engine is unconfigured, already running, or the run
   *   is aborted by an unrecoverable API error
   */
  async start(): Promise<void> {
    if (this.state.running) {
      throw new Error('Engine is already running');
    }
    this.assertConfigured();
    this.prepareRun();
    this.callbacks.onStart?.(this.getState(), this.getStats());

    let reason: DeletionStopReason = 'completed';
    try {
      await this.runDeletionLoop();
      if (this.stopRequested) {
        reason = 'stopped';
      }
    } catch (error) {
      reason = 'error';
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks.onError?.(err);
      throw err;
    } finally {
      this.finishRun(reason);
    }
  }

  /** Pauses the deletion process. */
  pause(): void {
    if (!this.state.running || this.state.paused) {
      return;
    }
    this.state.paused = true;
    this.pausePromise = new Promise((resolve) => {
      this.pauseResolve = resolve;
    });
  }

  /** Resumes a paused deletion process. */
  resume(): void {
    if (!this.state.paused) {
      return;
    }
    this.state.paused = false;
    this.pauseResolve?.();
    this.pausePromise = null;
    this.pauseResolve = null;
  }

  /**
   * Stops the deletion process.
   *
   * Aborting the run's `AbortController` ends both the engine's own waits
   * (search delay, rate limit wait, backoff) and the request currently in
   * flight, so the run unwinds immediately rather than at the end of the
   * current timer or whenever a stalled connection happens to settle.
   */
  stop(): void {
    this.stopRequested = true;
    if (this.state.paused) {
      this.resume();
    }
    this.abortController?.abort();
    if (this.state.running) {
      this.persistProgress();
    }
  }

  /** Returns a copy of the current state. */
  getState(): DeletionEngineState {
    return { ...this.state };
  }

  /** Returns a copy of the current statistics. */
  getStats(): DeletionEngineStats {
    return { ...this.stats };
  }

  // =========================================================================
  // Preview
  // =========================================================================

  /**
   * Previews what a run would delete, without deleting anything.
   *
   * `totalCount` is Discord's total for the search. `filtersApplied` is false
   * only when the first page held every result and none of them was excluded
   * by a client-side filter; in every other case results outside the sample
   * may still be excluded by pattern, pin state, message type or ownership, so
   * the count is an upper bound.
   *
   * @returns Total count, up to ten sample messages, a duration estimate, and
   *   whether client-side filters apply
   */
  async preview(): Promise<PreviewResult> {
    if (this.state.running) {
      throw new Error('Cannot preview while running');
    }
    this.assertConfigured();

    const response = await this.apiClient.searchMessages(
      this.buildSearchParams({}),
      this.requestSignal(),
    );
    const messages = extractHits(response);
    const deletable = messages.filter((message) => this.classifyExclusion(message) === null);

    const totalCount = response.total_results ?? 0;
    const pagesNeeded = Math.ceil(totalCount / MESSAGES_PER_PAGE);
    const estimatedTimeMs =
      totalCount * this.getDeleteDelay() + pagesNeeded * this.getSearchDelay();
    const sampleIsExact = messages.length >= totalCount && deletable.length === messages.length;

    return {
      totalCount,
      sampleMessages: deletable.slice(0, 10),
      estimatedTimeMs,
      filtersApplied: !sampleIsExact,
    };
  }

  // =========================================================================
  // Persistence
  // =========================================================================

  /** Whether a resumable session exists for the configured author. */
  hasSavedSession(): boolean {
    return this.loadSavedSession() !== null;
  }

  /** Loads the newest resumable session for the configured author. */
  loadSavedSession(): SavedProgress | null {
    return this.options ? findResumableSession(this.options.authorId) : null;
  }

  /**
   * Configures the engine from a saved session.
   *
   * The next {@link start} preserves the restored counters and resumes from the
   * saved cursor instead of starting over.
   *
   * @param progress - The saved progress to resume from
   * @throws Error when the engine is currently running
   */
  resumeFromSaved(progress: SavedProgress): void {
    if (this.state.running) {
      throw new Error('Cannot resume while running');
    }

    const configOptions: Partial<DeletionEngineOptions> = {
      authorId: progress.authorId,
      deletionOrder: progress.deletionOrder,
    };
    if (progress.guildId) configOptions.guildId = progress.guildId;
    if (progress.channelId) configOptions.channelId = progress.channelId;
    applySavedFilters(configOptions, progress.filters);
    if (progress.cursor.maxId) configOptions.maxId = progress.cursor.maxId;
    if (progress.cursor.minId) configOptions.minId = progress.cursor.minId;

    this.configure(configOptions);

    this.resumedState = {
      runId: progress.runId,
      deletedCount: progress.deletedCount,
      failedCount: progress.failedCount,
      skippedCount: progress.skippedCount,
      alreadyGoneCount: progress.alreadyGoneCount,
      totalFound: progress.totalFound,
      initialTotalFound: progress.initialTotalFound,
      cursor: progress.cursor,
    };
  }

  /**
   * Clears the saved session for the configured author and target.
   *
   * While a run owns a run ID, only that run's checkpoint is removed, so a
   * completion in this tab cannot erase a checkpoint written by another.
   */
  clearSavedSession(): void {
    const opts = this.options;
    if (!opts) return;
    clearProgress(opts.authorId, targetKeyFor(opts), this.runId);
  }

  // =========================================================================
  // Private - run setup and teardown
  // =========================================================================

  /** Throws unless the engine has everything it needs to run. */
  private assertConfigured(): void {
    if (!this.options) {
      throw new Error('Engine not configured');
    }
    if (!this.options.authToken || !this.options.authorId || !this.options.channelId) {
      throw new Error('Missing required options: authToken, authorId, channelId');
    }
  }

  /** Resets per-run state, applying anything restored from a saved session. */
  private prepareRun(): void {
    const resumed = this.resumedState;
    this.resumedState = null;

    this.state = createInitialState();
    this.stats = createInitialStats();
    this.pingHistory = [];
    this.pausePromise = null;
    this.pauseResolve = null;
    this.consecutiveSuccesses = 0;
    this.currentDelay = this.baselineDelay;
    this.isThrottled = false;
    this.attemptedMessageIds = new Set();
    this.lastProcessedId = null;
    this.totalsInitialised = false;
    this.cursorMaxId = this.options?.maxId;
    this.stopRequested = false;
    this.abortController = new AbortController();
    this.runId = resumed?.runId ?? this.options?.runId ?? createRunId();

    if (resumed) {
      this.applyResumedState(resumed);
    }

    this.state.running = true;
    this.stats.startTime = Date.now();
  }

  /** Restores counters and cursor from a saved session. */
  private applyResumedState(resumed: ResumedRunState): void {
    this.state.deletedCount = resumed.deletedCount;
    this.state.failedCount = resumed.failedCount;
    this.state.skippedCount = resumed.skippedCount;
    this.state.alreadyGoneCount = resumed.alreadyGoneCount;
    this.state.totalFound = resumed.totalFound;
    this.state.initialTotalFound = resumed.initialTotalFound;
    this.totalsInitialised = resumed.initialTotalFound > 0;
    if (resumed.cursor.maxId) {
      this.cursorMaxId = resumed.cursor.maxId;
    }
  }

  /** Ends the run: settles state, persists or clears progress, notifies. */
  private finishRun(reason: DeletionStopReason): void {
    this.state.running = false;
    this.state.paused = false;
    this.abortController = null;
    this.setStatus(undefined);

    if (reason === 'completed') {
      this.clearSavedSession();
    } else {
      this.persistProgress();
    }

    this.callbacks.onStop?.(this.getState(), this.getStats(), { reason });
  }

  /** Writes the current progress to page storage. */
  private persistProgress(): void {
    const opts = this.options;
    if (!opts) return;

    const progress: SavedProgress = {
      version: 2,
      runId: this.runId || createRunId(),
      authorId: opts.authorId,
      deletionOrder: opts.deletionOrder ?? 'newest',
      cursor: this.buildCursor(),
      deletedCount: this.state.deletedCount,
      failedCount: this.state.failedCount,
      skippedCount: this.state.skippedCount,
      alreadyGoneCount: this.state.alreadyGoneCount,
      totalFound: this.state.totalFound,
      initialTotalFound: this.state.initialTotalFound,
      timestamp: Date.now(),
    };
    if (opts.guildId) progress.guildId = opts.guildId;
    if (opts.channelId) progress.channelId = opts.channelId;

    const filters = this.buildSavedFilters();
    if (filters) progress.filters = filters;

    saveProgress(progress);
  }

  /** Builds the direction-specific resume cursor. */
  private buildCursor(): SavedProgress['cursor'] {
    if ((this.options?.deletionOrder ?? 'newest') === 'oldest') {
      return this.lastProcessedId === null
        ? {}
        : { minId: (BigInt(this.lastProcessedId) + 1n).toString() };
    }
    return this.cursorMaxId === undefined ? {} : { maxId: this.cursorMaxId };
  }

  /** Snapshots the user's filters for a later resume, or null when there are none. */
  private buildSavedFilters(): SavedFilters | null {
    const opts = this.options;
    if (!opts) return null;

    const filters: SavedFilters = {};
    let hasFilters = false;
    if (opts.content !== undefined) {
      filters.content = opts.content;
      hasFilters = true;
    }
    if (opts.hasLink !== undefined) {
      filters.hasLink = opts.hasLink;
      hasFilters = true;
    }
    if (opts.hasFile !== undefined) {
      filters.hasFile = opts.hasFile;
      hasFilters = true;
    }
    if (opts.includePinned !== undefined) {
      filters.includePinned = opts.includePinned;
      hasFilters = true;
    }
    if (opts.pattern !== undefined) {
      filters.pattern = opts.pattern;
      hasFilters = true;
    }
    if (opts.minId !== undefined) {
      filters.minId = opts.minId;
      hasFilters = true;
    }
    if (opts.maxId !== undefined) {
      filters.maxId = opts.maxId;
      hasFilters = true;
    }
    return hasFilters ? filters : null;
  }

  // =========================================================================
  // Private - deletion loops
  // =========================================================================

  /** Dispatches to the loop for the configured deletion order. */
  private async runDeletionLoop(): Promise<void> {
    if (this.options?.deletionOrder === 'oldest') {
      await this.runOldestFirstDeletionLoop();
      return;
    }
    await this.runNewestFirstDeletionLoop();
  }

  /**
   * Newest-first loop.
   *
   * Each page is fetched with `max_id = cursor`; the cursor then moves strictly
   * below the oldest id on the page, whether or not anything on it was
   * deletable. That makes progress monotonic, so a page of pinned or
   * non-matching messages can never be fetched twice.
   */
  private async runNewestFirstDeletionLoop(): Promise<void> {
    let emptyPageRetries = 0;

    while (!this.stopRequested) {
      await this.waitWhilePaused();
      const page = await this.searchWithRetry({ maxId: this.cursorMaxId });
      if (this.stopRequested) return;

      if (page.length === 0) {
        if (!(await this.retryEmptyPage(emptyPageRetries))) return;
        emptyPageRetries++;
        continue;
      }

      emptyPageRetries = 0;
      const next = this.advanceCursor(page, this.cursorMaxId, this.options?.minId);
      await this.processMessages(page);
      // A stop mid-page must not advance the cursor past the unprocessed remainder.
      if (this.stopRequested || next === null) return;
      this.cursorMaxId = next;
      await this.delay(this.getSearchDelay());
    }
  }

  /**
   * Oldest-first loop.
   *
   * Locates the oldest message, splits the span up to the newest message into
   * week-long windows, and walks them in order.
   */
  private async runOldestFirstDeletionLoop(): Promise<void> {
    const bounds = await this.findMessageBounds();
    if (!bounds || this.stopRequested) return;

    for (const window of this.generateTimeWindows(bounds.oldest, bounds.newest)) {
      if (this.stopRequested) return;
      await this.processTimeWindow(window.minId, window.maxId);
    }
  }

  /** Walks one time window with the same monotonic cursor as the main loop. */
  private async processTimeWindow(windowMinId: string, windowMaxId: string): Promise<void> {
    let cursor: string | undefined = windowMaxId;
    let emptyPageRetries = 0;

    while (!this.stopRequested) {
      await this.waitWhilePaused();
      const page = await this.searchWithRetry({ minId: windowMinId, maxId: cursor });
      if (this.stopRequested) return;

      if (page.length === 0) {
        if (!(await this.retryEmptyPage(emptyPageRetries))) return;
        emptyPageRetries++;
        continue;
      }

      emptyPageRetries = 0;
      const next = this.advanceCursor(page, cursor, windowMinId);
      await this.processMessages(sortByIdAscending(page));
      if (this.stopRequested || next === null) return;
      cursor = next;
      await this.delay(this.getSearchDelay());
    }
  }

  /**
   * Decides whether an empty page is a stale index or the end of the range.
   *
   * @param retries - Empty pages seen so far for this cursor
   * @returns True when the caller should search again
   */
  private async retryEmptyPage(retries: number): Promise<boolean> {
    if (this.state.totalFound <= 0 || retries >= MAX_EMPTY_PAGE_RETRIES) {
      return false;
    }
    await this.delay(Math.round(this.getSearchDelay() * EMPTY_PAGE_BACKOFF_MULTIPLIER ** retries));
    return !this.stopRequested;
  }

  /**
   * Moves the cursor down to the oldest message the page contained.
   *
   * The next search asks for `max_id = <page minimum>`. Discord's `max_id` may
   * be inclusive, in which case that page minimum comes back once more and is
   * skipped by {@link attemptedMessageIds}; what must never happen is a cursor
   * that does not move, so when the page minimum is not below the current
   * cursor the cursor is decremented by one instead. Progress is therefore
   * monotonic whether or not anything on the page was deletable.
   *
   * @returns The next cursor, or null when the range is exhausted
   */
  private advanceCursor(
    page: DiscordMessage[],
    current: string | undefined,
    floorId: string | undefined,
  ): string | null {
    let next = minMessageId(page);
    if (next === null) return null;
    if (current !== undefined && next >= BigInt(current)) {
      next = BigInt(current) - 1n;
    }
    if (next < 0n) return null;
    if (floorId !== undefined && next < BigInt(floorId)) return null;
    return next.toString();
  }

  // =========================================================================
  // Private - message processing
  // =========================================================================

  /** Processes a page: filters, deletes, reports an outcome for each message. */
  private async processMessages(messages: DiscordMessage[]): Promise<void> {
    for (const message of messages) {
      await this.waitWhilePaused();
      if (this.stopRequested) return;
      if (this.attemptedMessageIds.has(message.id)) continue;
      this.attemptedMessageIds.add(message.id);

      const excluded = this.classifyExclusion(message);
      if (excluded) {
        this.recordOutcome(message, excluded);
        continue;
      }

      const outcome = await this.deleteWithRetry(message);
      if (outcome === null) {
        // Stopped before the delete was attempted: leave no trace of the
        // attempt so a resumed run picks this message up again.
        this.attemptedMessageIds.delete(message.id);
        return;
      }
      this.recordOutcome(message, outcome);
      await this.delay(this.getDeleteDelay());
    }
  }

  /**
   * Applies the client-side filters and the ownership guard.
   *
   * @returns A `skipped` outcome, or null when the message should be deleted
   */
  private classifyExclusion(message: DiscordMessage): MessageOutcome | null {
    const opts = this.options;
    if (!opts) return null;

    if (message.author?.id !== opts.authorId) {
      return { status: 'skipped', reason: 'Not authored by current user' };
    }
    if (!DELETABLE_MESSAGE_TYPES.has(message.type)) {
      return { status: 'skipped', reason: `Message type ${message.type} cannot be deleted` };
    }
    if (opts.channelId && !opts.guildId && message.channel_id !== opts.channelId) {
      return { status: 'skipped', reason: 'Message is in a thread' };
    }
    if (message.pinned && !opts.includePinned) {
      return { status: 'skipped', reason: 'Pinned message' };
    }
    if (this.compiledPattern && !safeRegexTest(this.compiledPattern, message.content)) {
      return { status: 'skipped', reason: 'Content does not match pattern' };
    }
    return null;
  }

  /** Applies an outcome to the counters and reports it. */
  private recordOutcome(message: DiscordMessage, outcome: MessageOutcome): void {
    if (outcome.status === 'deleted') {
      this.state.deletedCount++;
      this.lastProcessedId = message.id;
    } else if (outcome.status === 'already_gone') {
      this.state.alreadyGoneCount++;
      this.lastProcessedId = message.id;
    } else if (outcome.status === 'skipped') {
      this.state.skippedCount++;
    } else {
      this.state.failedCount++;
    }

    if (outcome.status === 'deleted' && shouldSaveProgress(this.state.deletedCount)) {
      this.persistProgress();
    }

    this.updateEstimatedTime();
    this.callbacks.onProgress?.(this.getState(), this.getStats(), message, outcome);
  }

  // =========================================================================
  // Private - API access
  // =========================================================================

  /** Builds search parameters, merging a loop range with the user's filters. */
  private buildSearchParams(range: SearchRange): SearchParams {
    const opts = this.options;
    if (!opts) {
      throw new Error('Engine not configured');
    }

    const params: SearchParams = {
      channelId: opts.channelId,
      authorId: opts.authorId,
      offset: 0,
    };
    if (opts.guildId !== undefined) params.guildId = opts.guildId;
    if (opts.content !== undefined) params.content = opts.content;
    if (opts.hasLink !== undefined) params.hasLink = opts.hasLink;
    if (opts.hasFile !== undefined) params.hasFile = opts.hasFile;
    if (opts.includePinned !== undefined) params.includePinned = opts.includePinned;

    const minId = maxSnowflake(range.minId, opts.minId);
    const maxId = minSnowflake(range.maxId, opts.maxId);
    if (minId !== undefined) params.minId = minId;
    if (maxId !== undefined) params.maxId = maxId;

    return params;
  }

  /**
   * Searches with the full retry policy.
   *
   * Unrecoverable failures (401, 403, exhausted backoff) propagate and abort
   * the run; they are never swallowed.
   *
   * @param range - Snowflake range for this page
   * @param trackTotals - Whether the response updates the run totals
   */
  private async searchWithRetry(range: SearchRange, trackTotals = true): Promise<DiscordMessage[]> {
    const budget: RetryBudget = { backoff: 0, indexing: 0, rateLimits: 0 };

    while (!this.stopRequested) {
      try {
        const params = this.buildSearchParams(range);
        await this.respectRateLimitHeader();
        if (!(await this.readyForRequest())) {
          return [];
        }
        const started = Date.now();
        const response = await this.apiClient.searchMessages(params, this.requestSignal());
        this.recordPing(Date.now() - started);
        this.setStatus(undefined);
        if (trackTotals) {
          this.recordTotals(response);
        }
        return extractHits(response);
      } catch (error) {
        if (isAbortedFailure(error)) {
          return [];
        }
        await this.handleSearchFailure(error, budget);
      }
    }
    return [];
  }

  /**
   * Searches a bounded range. Kept as a named entry point for the oldest-first
   * path; it shares the retry and abort policy of every other search.
   */
  private searchWithConstraints(
    minId: string | undefined,
    maxId: string | undefined,
    trackTotals = true,
  ): Promise<DiscordMessage[]> {
    const range: SearchRange = {};
    if (minId !== undefined) range.minId = minId;
    if (maxId !== undefined) range.maxId = maxId;
    return this.searchWithRetry(range, trackTotals);
  }

  /** Waits out a recoverable search failure, or rethrows an unrecoverable one. */
  private async handleSearchFailure(error: unknown, budget: RetryBudget): Promise<void> {
    if (!DiscordApiError.is(error)) {
      throw error;
    }
    const maxRetries = this.getMaxRetries();

    switch (error.code) {
      case 'RATE_LIMITED':
        budget.rateLimits++;
        if (budget.rateLimits > MAX_CONSECUTIVE_RATE_LIMITS) throw error;
        await this.waitForRateLimit(error);
        return;
      case 'INDEXING':
        budget.indexing++;
        if (budget.indexing > maxRetries * INDEXING_RETRY_MULTIPLIER) throw error;
        this.setStatus(INDEXING_STATUS);
        await this.waitBeforeRetry(this.getSearchDelay());
        return;
      case 'NETWORK_ERROR':
      case 'SERVER_ERROR':
        budget.backoff++;
        if (budget.backoff > maxRetries) throw error;
        await this.waitBeforeRetry(backoffDelayMs(budget.backoff));
        return;
      default:
        throw error;
    }
  }

  /**
   * Deletes one message with the full retry policy.
   *
   * @returns The outcome, or null when the run was stopped before the delete
   *   was attempted — the caller must then record nothing for this message
   */
  private async deleteWithRetry(message: DiscordMessage): Promise<MessageOutcome | null> {
    const budget: RetryBudget = { backoff: 0, indexing: 0, rateLimits: 0 };

    while (!this.stopRequested) {
      try {
        await this.respectRateLimitHeader();
        if (!(await this.readyForRequest())) {
          return null;
        }
        const started = Date.now();
        const result = await this.apiClient.deleteMessage(
          message.channel_id,
          message.id,
          this.requestSignal(),
        );
        this.recordPing(Date.now() - started);
        if (result === 'already_gone') {
          return { status: 'already_gone' };
        }
        this.handleSuccessfulDeletion();
        return { status: 'deleted' };
      } catch (error) {
        if (isAbortedFailure(error)) {
          return null;
        }
        const outcome = await this.handleDeleteFailure(error, budget);
        if (outcome) {
          return outcome;
        }
      }
    }
    return null;
  }

  /**
   * Decides what a failed delete means.
   *
   * @returns A terminal outcome, or null when the delete should be retried
   * @throws The original error when the run must abort (401, non-API errors)
   */
  private async handleDeleteFailure(
    error: unknown,
    budget: RetryBudget,
  ): Promise<MessageOutcome | null> {
    if (!DiscordApiError.is(error)) {
      throw error;
    }
    if (error.code === 'UNAUTHORIZED') {
      throw error;
    }

    switch (error.code) {
      case 'RATE_LIMITED':
        budget.rateLimits++;
        if (budget.rateLimits > MAX_CONSECUTIVE_RATE_LIMITS) return failureOutcome(error);
        await this.waitForRateLimit(error);
        return null;
      case 'NETWORK_ERROR':
      case 'SERVER_ERROR':
        budget.backoff++;
        if (budget.backoff > this.getMaxRetries()) return failureOutcome(error);
        await this.waitBeforeRetry(backoffDelayMs(budget.backoff));
        return null;
      case 'FORBIDDEN':
        return {
          status: 'skipped',
          reason: error.isArchivedThread ? 'Archived thread' : error.message || 'Forbidden',
          code: 'FORBIDDEN',
        };
      case 'NOT_FOUND':
        return { status: 'already_gone', code: 'NOT_FOUND' };
      default:
        return failureOutcome(error);
    }
  }

  /** Records a 429, smooths the delete delay, and waits it out. */
  private async waitForRateLimit(error: DiscordApiError): Promise<void> {
    const waitMs = rateLimitWaitMs(error);
    this.stats.throttledCount++;
    this.stats.throttledTime += waitMs;
    this.handleRateLimit(waitMs);
    await this.waitBeforeRetry(waitMs);
  }

  /**
   * Waits `ms`, then holds for as long as the run is paused.
   *
   * Every retry wait goes through here so that a Pause entered during the wait
   * still blocks the retry, rather than being noticed only at the next page.
   */
  private async waitBeforeRetry(ms: number): Promise<void> {
    await this.delay(ms);
    await this.waitWhilePaused();
  }

  /**
   * Holds for a pause and reports whether another request may be issued.
   *
   * Called immediately before every search and delete: a Stop that aborted the
   * preceding wait must not be followed by one more request.
   *
   * @returns False when the run has been stopped
   */
  private async readyForRequest(): Promise<boolean> {
    await this.waitWhilePaused();
    return !this.stopRequested;
  }

  /**
   * The signal tying an in-flight request to this run.
   *
   * `stop()` aborts the controller, so the request is cancelled rather than
   * left to settle in its own time. Outside a run there is no controller and
   * the request is issued without a signal.
   */
  private requestSignal(): AbortSignal | undefined {
    return this.abortController?.signal;
  }

  /** Waits out an exhausted bucket before spending another request on it. */
  private async respectRateLimitHeader(): Promise<void> {
    const info = this.apiClient.getRateLimitInfo();
    if (info?.remaining !== 0) {
      return;
    }
    const resetAfter = info.resetAfter;
    if (!Number.isFinite(resetAfter) || resetAfter <= 0) {
      return;
    }
    await this.delay(Math.min(resetAfter * 1000, MAX_HEADER_WAIT_MS));
  }

  /** Updates the run totals from a search response. */
  private recordTotals(response: SearchResponse): void {
    const total = response.total_results ?? 0;
    this.state.totalFound = total;
    if (!this.totalsInitialised) {
      this.state.initialTotalFound = total;
      this.totalsInitialised = true;
    }
  }

  // =========================================================================
  // Private - oldest-first discovery
  // =========================================================================

  /** Finds the oldest and newest matching message dates. */
  private async findMessageBounds(): Promise<{ oldest: Date; newest: Date } | null> {
    this.setStatus('Finding oldest message…');
    const firstPage = await this.searchWithConstraints(undefined, undefined);
    const newestMessage = firstPage[0];
    if (!newestMessage || this.stopRequested) {
      this.setStatus(undefined);
      return null;
    }

    const newest = snowflakeToDate(newestMessage.id);
    const oldest = await this.bisectOldestDate(newest);
    this.setStatus(undefined);
    return { oldest, newest };
  }

  /**
   * Bisects the timeline for a lower bound on the oldest matching message.
   *
   * A search page holds at most 25 results, so the oldest message *on a page*
   * is not the oldest message overall. Only the lower bound is sound: `low`
   * advances solely when a search proved nothing exists at or before it.
   */
  private async bisectOldestDate(newestDate: Date): Promise<Date> {
    let low = new Date(DISCORD_EPOCH_ISO);
    let high = newestDate;

    for (let step = 1; step <= MAX_BISECTION_STEPS; step++) {
      if (this.stopRequested) break;
      if (high.getTime() - low.getTime() <= TIME_WINDOW_SIZE_MS) break;
      await this.waitWhilePaused();
      this.setStatus(`Finding oldest message… (step ${step}/${MAX_BISECTION_STEPS})`);

      const mid = new Date((low.getTime() + high.getTime()) / 2);
      const results = await this.searchWithConstraints(undefined, dateToSnowflake(mid), false);
      if (this.stopRequested) break;

      if (results.length > 0) {
        high = mid;
      } else {
        low = mid;
      }
      await this.delay(this.getSearchDelay());
    }

    return low;
  }

  /**
   * Splits the span between two dates into week-long windows.
   *
   * The upper bound is the newest matching message, not `Date.now()`, so a run
   * never grinds through empty windows up to the present.
   */
  private generateTimeWindows(
    oldestDate: Date,
    newestDate: Date,
  ): Array<{ minId: string; maxId: string }> {
    const windows: Array<{ minId: string; maxId: string }> = [];
    const endTime = newestDate.getTime() + 1;
    let windowStart = oldestDate.getTime();

    while (windowStart < endTime) {
      const windowEnd = Math.min(windowStart + TIME_WINDOW_SIZE_MS, endTime);
      windows.push({
        minId: dateToSnowflake(new Date(windowStart)),
        maxId: dateToSnowflake(new Date(windowEnd)),
      });
      windowStart = windowEnd;
    }

    return windows;
  }

  // =========================================================================
  // Private - rate limit smoothing
  // =========================================================================

  /** Eases the delete delay back toward baseline after a run of successes. */
  private handleSuccessfulDeletion(): void {
    if (!this.isThrottled) {
      return;
    }
    this.consecutiveSuccesses++;
    if (this.consecutiveSuccesses < THROTTLE_RECOVERY_THRESHOLD) {
      return;
    }

    this.currentDelay = Math.max(
      this.baselineDelay,
      this.currentDelay * (1 - THROTTLE_RECOVERY_PERCENTAGE),
    );
    this.consecutiveSuccesses = 0;

    if (this.currentDelay <= this.baselineDelay) {
      this.currentDelay = this.baselineDelay;
      this.isThrottled = false;
    }

    this.callbacks.onRateLimitChange?.({
      isThrottled: this.isThrottled,
      currentDelay: this.currentDelay,
    });
  }

  /** Raises the delete delay partway toward the reported `retry_after`. */
  private handleRateLimit(retryAfterMs: number): void {
    this.isThrottled = true;
    this.consecutiveSuccesses = 0;

    const gap = retryAfterMs - this.currentDelay;
    if (gap > 0) {
      this.currentDelay = this.currentDelay + gap * THROTTLE_INCREASE_PERCENTAGE;
    }

    this.callbacks.onRateLimitChange?.({
      isThrottled: this.isThrottled,
      currentDelay: this.currentDelay,
    });
  }

  // =========================================================================
  // Private - bookkeeping
  // =========================================================================

  /** Records a request round trip for the rolling average. */
  private recordPing(ping: number): void {
    this.pingHistory.push(ping);
    if (this.pingHistory.length > 20) {
      this.pingHistory.shift();
    }
    const sum = this.pingHistory.reduce((a, b) => a + b, 0);
    this.stats.averagePing = Math.round(sum / this.pingHistory.length);
  }

  /** Recomputes the estimate from everything processed so far. */
  private updateEstimatedTime(): void {
    const processed =
      this.state.deletedCount +
      this.state.failedCount +
      this.state.skippedCount +
      this.state.alreadyGoneCount;

    if (this.state.initialTotalFound === 0 || processed === 0) {
      this.stats.estimatedTimeRemaining = -1;
      return;
    }

    const elapsed = Date.now() - this.stats.startTime;
    const remaining = Math.max(0, this.state.initialTotalFound - processed);
    this.stats.estimatedTimeRemaining = Math.round((elapsed / processed) * remaining);
  }

  /** Publishes a status message to the UI. */
  private setStatus(status: string | undefined): void {
    if (this.state.status === status) {
      return;
    }
    this.state.status = status;
    this.callbacks.onStatus?.(status);
  }

  /** Blocks while the engine is paused. */
  private async waitWhilePaused(): Promise<void> {
    while (this.state.paused && this.pausePromise && !this.stopRequested) {
      await this.pausePromise;
    }
  }

  /** Configured search delay. */
  private getSearchDelay(): number {
    return this.options?.searchDelay ?? DEFAULT_SEARCH_DELAY;
  }

  /** Current delete delay, honouring rate limit smoothing. */
  private getDeleteDelay(): number {
    if (this.isThrottled) {
      return this.currentDelay;
    }
    return this.options?.deleteDelay ?? DEFAULT_DELETE_DELAY;
  }

  /** Configured retry budget. */
  private getMaxRetries(): number {
    return this.options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /**
   * Waits, unless the run is stopped first.
   *
   * The wait is tied to the run's `AbortController`, so `stop()` ends it
   * immediately instead of leaving the engine parked on a ten-second timer.
   */
  private delay(ms: number): Promise<void> {
    if (this.stopRequested || ms <= 0) {
      return Promise.resolve();
    }
    const signal = this.abortController?.signal;
    if (signal?.aborted) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const finish = (): void => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', finish);
        resolve();
      };
      const timer = setTimeout(finish, ms);
      signal?.addEventListener('abort', finish, { once: true });
    });
  }
}

// =============================================================================
// Factory helpers
// =============================================================================

/** Compiles and validates a user-supplied pattern. */
function compilePattern(pattern: string): RegExp | null {
  if (!pattern) {
    return null;
  }
  const result = validateRegex(pattern, 'i');
  if (!result.valid) {
    throw new Error(`Invalid regex pattern: ${result.error}`);
  }
  return result.regex ?? null;
}

/** A fresh engine state. */
function createInitialState(): DeletionEngineState {
  return {
    running: false,
    paused: false,
    deletedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    alreadyGoneCount: 0,
    totalFound: 0,
    initialTotalFound: 0,
    currentOffset: 0,
  };
}

/** A fresh statistics record. */
function createInitialStats(): DeletionEngineStats {
  return {
    startTime: 0,
    throttledCount: 0,
    throttledTime: 0,
    averagePing: 0,
    estimatedTimeRemaining: -1,
  };
}
