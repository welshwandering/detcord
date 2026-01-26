/**
 * DeletionEngine - Orchestrates bulk message deletion for Detcord
 *
 * This module provides a stateful engine for searching and deleting Discord messages.
 * It handles rate limiting, retries, pagination, and progress tracking.
 */

import { dateToSnowflake, snowflakeToDate } from '../utils/helpers';
import { validateRegex } from '../utils/validators';
import type {
  DiscordMessage as ApiDiscordMessage,
  RateLimitInfo as ApiRateLimitInfo,
  SearchResponse as ApiSearchResponse,
} from './discord-api';
import {
  clearProgress,
  hasExistingSession,
  loadProgress,
  type SavedFilters,
  type SavedProgress,
  saveProgress,
  shouldSaveProgress,
} from './persistence';

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * Discord message structure - re-export from discord-api for consistency
 */
export type DiscordMessage = ApiDiscordMessage;

/**
 * Search response from Discord API - re-export from discord-api
 */
export type SearchResponse = ApiSearchResponse;

/**
 * Rate limit information from API response - extended for engine use
 */
export interface RateLimitInfo extends Pick<ApiRateLimitInfo, 'remaining' | 'resetAfter'> {
  retryAfter?: number;
}

/**
 * API client interface - dependency injection for testability
 */
export interface DiscordApiClient {
  searchMessages(params: {
    guildId?: string;
    channelId?: string;
    authorId?: string;
    content?: string;
    hasLink?: boolean;
    hasFile?: boolean;
    minId?: string;
    maxId?: string;
    includePinned?: boolean;
    includeNsfw?: boolean;
    offset?: number;
  }): Promise<SearchResponse>;

  deleteMessage(
    channelId: string,
    messageId: string,
  ): Promise<{ success: boolean; error?: string; retryAfter?: number }>;

  getRateLimitInfo(): RateLimitInfo | null;
}

/**
 * Deletion order determines which messages are deleted first
 */
export type DeletionOrder = 'newest' | 'oldest';

/**
 * Configuration options for the deletion engine
 */
export interface DeletionEngineOptions {
  /** Discord auth token */
  authToken: string;
  /** ID of the message author (user) */
  authorId: string;
  /** Guild (server) ID - optional, for server-wide search */
  guildId?: string;
  /** Channel ID - required for channel-specific search */
  channelId: string;
  /** Minimum message ID (for "after" date filter) */
  minId?: string;
  /** Maximum message ID (for "before" date filter) */
  maxId?: string;
  /** Text content filter */
  content?: string;
  /** Filter for messages containing links */
  hasLink?: boolean;
  /** Filter for messages containing file attachments */
  hasFile?: boolean;
  /** Whether to include pinned messages (default: false) */
  includePinned?: boolean;
  /** Regex pattern for content matching */
  pattern?: string;
  /** Delay between search requests in ms (default: 10000) */
  searchDelay?: number;
  /** Delay between delete requests in ms (default: 1000) */
  deleteDelay?: number;
  /** Maximum retries for rate limit recovery (default: 3) */
  maxRetries?: number;
  /** Order to delete messages: 'newest' (default) or 'oldest' first */
  deletionOrder?: DeletionOrder;
}

/**
 * Current state of the deletion engine
 */
export interface DeletionEngineState {
  /** Whether the engine is currently running */
  running: boolean;
  /** Whether the engine is paused */
  paused: boolean;
  /** Number of messages successfully deleted */
  deletedCount: number;
  /** Number of messages that failed to delete */
  failedCount: number;
  /** Number of messages skipped (permanently undeletable - threads, permissions, etc.) */
  skippedCount: number;
  /** Total number of messages found matching filters (current remaining from latest search) */
  totalFound: number;
  /** Initial total found on first search (used for progress calculation) */
  initialTotalFound: number;
  /** Current search offset for pagination */
  currentOffset: number;
  /** Current status message for UI feedback */
  status?: string | undefined;
}

/**
 * Statistics for the deletion operation
 */
export interface DeletionEngineStats {
  /** Timestamp when deletion started */
  startTime: number;
  /** Number of times we were rate limited */
  throttledCount: number;
  /** Total time spent waiting for rate limits (ms) */
  throttledTime: number;
  /** Average response time for API calls (ms) */
  averagePing: number;
  /** Estimated time remaining in ms (-1 if unknown) */
  estimatedTimeRemaining: number;
}

/**
 * Rate limit change information for callback
 */
export interface RateLimitChangeInfo {
  /** Whether the engine is currently throttled */
  isThrottled: boolean;
  /** Current delay between delete requests in ms */
  currentDelay: number;
}

/**
 * Event callbacks for engine lifecycle
 */
export interface DeletionEngineCallbacks {
  /** Called when deletion starts */
  onStart?: (state: DeletionEngineState, stats: DeletionEngineStats) => void;
  /** Called on each successful deletion */
  onProgress?: (
    state: DeletionEngineState,
    stats: DeletionEngineStats,
    message: DiscordMessage,
  ) => void;
  /** Called when deletion stops (complete, cancelled, or error) */
  onStop?: (state: DeletionEngineState, stats: DeletionEngineStats) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** Called when rate limit state changes */
  onRateLimitChange?: (info: RateLimitChangeInfo) => void;
  /** Called when status message changes (for UI feedback during long operations) */
  onStatus?: (status: string | undefined) => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Default delay between search API calls in ms */
const DEFAULT_SEARCH_DELAY = 10000;

/** Default delay between delete API calls in ms */
const DEFAULT_DELETE_DELAY = 1000;

/** Default maximum retries for rate limit recovery */
const DEFAULT_MAX_RETRIES = 3;

/** Number of messages per search page (Discord's limit) */
const MESSAGES_PER_PAGE = 25;

/** Message types that are deletable by the user */
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

/** Number of consecutive empty pages before assuming end of results */
const MAX_EMPTY_PAGE_RETRIES = 5;

/** Time window size for oldest-first deletion (1 week in milliseconds) */
const TIME_WINDOW_SIZE_MS = 7 * 24 * 60 * 60 * 1000;

/** Base multiplier for exponential backoff on empty pages (delay increases by this factor each retry) */
const EMPTY_PAGE_BACKOFF_MULTIPLIER = 1.3;

/** Number of consecutive successes needed before reducing delay */
const THROTTLE_RECOVERY_THRESHOLD = 5;

/** Percentage to decrease delay toward baseline after recovery threshold */
const THROTTLE_RECOVERY_PERCENTAGE = 0.1;

/** Percentage of gap toward retry_after to increase delay */
const THROTTLE_INCREASE_PERCENTAGE = 0.5;

/** Baseline delay between delete requests in ms */
const BASELINE_DELETE_DELAY = 1000;

// =============================================================================
// DeletionEngine Class
// =============================================================================

/**
 * Orchestrates the message deletion process.
 *
 * The engine maintains internal state and provides methods to start, pause,
 * resume, and stop deletion. It handles rate limiting, retries, and progress
 * tracking independently of any UI.
 */
export class DeletionEngine {
  private apiClient: DiscordApiClient;
  private options: DeletionEngineOptions | null = null;
  private callbacks: DeletionEngineCallbacks = {};

  private state: DeletionEngineState = {
    running: false,
    paused: false,
    deletedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    totalFound: 0,
    initialTotalFound: 0,
    currentOffset: 0,
  };

  private stats: DeletionEngineStats = {
    startTime: 0,
    throttledCount: 0,
    throttledTime: 0,
    averagePing: 0,
    estimatedTimeRemaining: -1,
  };

  private pingHistory: number[] = [];
  private stopRequested = false;
  private pausePromise: Promise<void> | null = null;
  private pauseResolve: (() => void) | null = null;
  private compiledPattern: RegExp | null = null;
  private attemptedMessageIds: Set<string> = new Set();
  private permanentlyFailedMessageIds: Set<string> = new Set();

  // Rate limit smoothing state
  private consecutiveSuccesses = 0;
  private currentDelay: number = BASELINE_DELETE_DELAY;
  private readonly baselineDelay = BASELINE_DELETE_DELAY;
  private isThrottled = false;

  // Persistence state
  private lastProcessedMaxId: string | null = null;

  /**
   * Creates a new DeletionEngine instance.
   *
   * @param apiClient - The Discord API client for making requests
   */
  constructor(apiClient: DiscordApiClient) {
    this.apiClient = apiClient;
  }

  /**
   * Configures the engine with deletion options.
   *
   * @param options - Partial options to merge with existing config
   */
  configure(options: Partial<DeletionEngineOptions>): void {
    if (this.state.running) {
      throw new Error('Cannot configure while running');
    }

    this.options = {
      ...(this.options ?? ({} as DeletionEngineOptions)),
      ...options,
    } as DeletionEngineOptions;

    // Validate and compile regex pattern if provided
    if (options.pattern !== undefined) {
      if (options.pattern) {
        const validationResult = validateRegex(options.pattern, 'i');
        if (!validationResult.valid) {
          throw new Error(`Invalid regex pattern: ${validationResult.error}`);
        }
        this.compiledPattern = validationResult.regex ?? null;
      } else {
        this.compiledPattern = null;
      }
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

  /**
   * Starts the deletion process.
   *
   * @throws Error if options are not configured or missing required fields
   */
  async start(): Promise<void> {
    if (this.state.running) {
      throw new Error('Engine is already running');
    }

    if (!this.options) {
      throw new Error('Engine not configured');
    }

    if (!this.options.authToken || !this.options.authorId || !this.options.channelId) {
      throw new Error('Missing required options: authToken, authorId, channelId');
    }

    // Reset state for new run
    this.resetState();
    this.state.running = true;
    this.stats.startTime = Date.now();
    this.stopRequested = false;

    this.callbacks.onStart?.(this.getState(), this.getStats());

    try {
      await this.runDeletionLoop();

      // Clear saved session on successful completion (not stopped by user)
      if (!this.stopRequested) {
        this.clearSavedSession();
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.callbacks.onError?.(err);
      throw err;
    } finally {
      this.state.running = false;
      this.state.paused = false;
      this.callbacks.onStop?.(this.getState(), this.getStats());
    }
  }

  /**
   * Pauses the deletion process.
   */
  pause(): void {
    if (!this.state.running || this.state.paused) {
      return;
    }

    this.state.paused = true;
    this.pausePromise = new Promise((resolve) => {
      this.pauseResolve = resolve;
    });
  }

  /**
   * Resumes a paused deletion process.
   */
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
   */
  stop(): void {
    this.stopRequested = true;
    if (this.state.paused) {
      this.resume(); // Unblock the pause to allow clean exit
    }
  }

  /**
   * Preview messages that would be deleted without actually deleting them.
   * Satisfies SPEC requirements PRV-1, PRV-2, PRV-3.
   *
   * @returns Preview result with total count, sample messages, and estimated time
   */
  async preview(): Promise<{
    totalCount: number;
    sampleMessages: DiscordMessage[];
    estimatedTimeMs: number;
  }> {
    if (this.state.running) {
      throw new Error('Cannot preview while running');
    }

    if (!this.options) {
      throw new Error('Engine not configured');
    }

    if (!this.options.authToken || !this.options.authorId || !this.options.channelId) {
      throw new Error('Missing required options: authToken, authorId, channelId');
    }

    const opts = this.options;

    // Build search params
    const searchParams: Parameters<typeof this.apiClient.searchMessages>[0] = {
      channelId: opts.channelId,
      authorId: opts.authorId,
      offset: 0,
    };

    if (opts.guildId !== undefined) searchParams.guildId = opts.guildId;
    if (opts.content !== undefined) searchParams.content = opts.content;
    if (opts.hasLink !== undefined) searchParams.hasLink = opts.hasLink;
    if (opts.hasFile !== undefined) searchParams.hasFile = opts.hasFile;
    if (opts.minId !== undefined) searchParams.minId = opts.minId;
    if (opts.maxId !== undefined) searchParams.maxId = opts.maxId;
    if (opts.includePinned !== undefined) searchParams.includePinned = opts.includePinned;

    // Perform a single search to get total count and sample messages
    const result = await this.apiClient.searchMessages(searchParams);

    // Extract messages from nested array structure
    const messages: DiscordMessage[] = [];
    for (const messageGroup of result.messages) {
      for (const msg of messageGroup) {
        messages.push(msg);
      }
    }

    // Filter to only deletable messages for the sample
    const deletableMessages = this.filterDeletableMessages(messages);

    // Calculate estimated time based on total count
    const totalCount = result.total_results;
    const deleteDelay = opts.deleteDelay ?? DEFAULT_DELETE_DELAY;
    const searchDelay = opts.searchDelay ?? DEFAULT_SEARCH_DELAY;
    const pagesNeeded = Math.ceil(totalCount / MESSAGES_PER_PAGE);
    const estimatedTimeMs = totalCount * deleteDelay + pagesNeeded * searchDelay;

    return {
      totalCount,
      sampleMessages: deletableMessages.slice(0, 10), // Return up to 10 samples
      estimatedTimeMs,
    };
  }

  /**
   * Returns a copy of the current state.
   */
  getState(): DeletionEngineState {
    return { ...this.state };
  }

  /**
   * Returns a copy of the current statistics.
   */
  getStats(): DeletionEngineStats {
    return { ...this.stats };
  }

  // =========================================================================
  // Persistence Methods
  // =========================================================================

  /**
   * Checks if there is a saved session that can be resumed.
   *
   * @returns true if a valid, non-expired session exists
   */
  hasSavedSession(): boolean {
    return hasExistingSession();
  }

  /**
   * Loads a saved session if one exists.
   *
   * @returns The saved progress if it exists and is valid, null otherwise
   */
  loadSavedSession(): SavedProgress | null {
    return loadProgress();
  }

  /**
   * Configures the engine from a saved progress state.
   * This allows resuming a previously interrupted deletion session.
   *
   * @param progress - The saved progress to resume from
   * @throws Error if the engine is currently running
   */
  resumeFromSaved(progress: SavedProgress): void {
    if (this.state.running) {
      throw new Error('Cannot resume while running');
    }

    // Configure the engine with the saved state
    const configOptions: Partial<DeletionEngineOptions> = {
      authorId: progress.authorId,
      maxId: progress.lastMaxId,
    };

    if (progress.guildId) {
      configOptions.guildId = progress.guildId;
    }

    if (progress.channelId) {
      configOptions.channelId = progress.channelId;
    }

    // Restore filters if they were saved
    if (progress.filters) {
      if (progress.filters.content !== undefined) {
        configOptions.content = progress.filters.content;
      }
      if (progress.filters.hasLink !== undefined) {
        configOptions.hasLink = progress.filters.hasLink;
      }
      if (progress.filters.hasFile !== undefined) {
        configOptions.hasFile = progress.filters.hasFile;
      }
      if (progress.filters.includePinned !== undefined) {
        configOptions.includePinned = progress.filters.includePinned;
      }
      if (progress.filters.pattern !== undefined) {
        configOptions.pattern = progress.filters.pattern;
      }
      if (progress.filters.minId !== undefined) {
        configOptions.minId = progress.filters.minId;
      }
    }

    this.configure(configOptions);

    // Restore counts from saved progress
    this.state.deletedCount = progress.deletedCount;
    this.state.totalFound = progress.totalFound;
    // Restore initialTotalFound if available, otherwise use totalFound for backward compatibility
    this.state.initialTotalFound = progress.initialTotalFound ?? progress.totalFound;
    this.lastProcessedMaxId = progress.lastMaxId;
  }

  /**
   * Clears any saved session from localStorage.
   */
  clearSavedSession(): void {
    clearProgress();
  }

  /**
   * Saves the current progress to localStorage.
   * Called periodically during deletion (every 10 deletions).
   */
  private saveProgressPeriodically(): void {
    if (!this.options) {
      return;
    }

    // Build the saved progress object
    const progress: SavedProgress = {
      authorId: this.options.authorId,
      lastMaxId: this.lastProcessedMaxId ?? this.options.maxId ?? '',
      deletedCount: this.state.deletedCount,
      totalFound: this.state.totalFound,
      initialTotalFound: this.state.initialTotalFound,
      timestamp: Date.now(),
    };

    if (this.options.guildId) {
      progress.guildId = this.options.guildId;
    }

    if (this.options.channelId) {
      progress.channelId = this.options.channelId;
    }

    // Save relevant filters
    const filters: SavedFilters = {};
    let hasFilters = false;

    if (this.options.content !== undefined) {
      filters.content = this.options.content;
      hasFilters = true;
    }
    if (this.options.hasLink !== undefined) {
      filters.hasLink = this.options.hasLink;
      hasFilters = true;
    }
    if (this.options.hasFile !== undefined) {
      filters.hasFile = this.options.hasFile;
      hasFilters = true;
    }
    if (this.options.includePinned !== undefined) {
      filters.includePinned = this.options.includePinned;
      hasFilters = true;
    }
    if (this.options.pattern !== undefined) {
      filters.pattern = this.options.pattern;
      hasFilters = true;
    }
    if (this.options.minId !== undefined) {
      filters.minId = this.options.minId;
      hasFilters = true;
    }

    if (hasFilters) {
      progress.filters = filters;
    }

    saveProgress(progress);
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Resets the internal state for a new deletion run.
   */
  private resetState(): void {
    this.state = {
      running: false,
      paused: false,
      deletedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      totalFound: 0,
      initialTotalFound: 0,
      currentOffset: 0,
    };

    this.stats = {
      startTime: 0,
      throttledCount: 0,
      throttledTime: 0,
      averagePing: 0,
      estimatedTimeRemaining: -1,
    };

    this.pingHistory = [];
    this.pausePromise = null;
    this.pauseResolve = null;

    // Reset rate limit smoothing state
    this.consecutiveSuccesses = 0;
    this.currentDelay = this.baselineDelay;
    this.isThrottled = false;

    // Reset persistence state
    this.lastProcessedMaxId = null;

    // Reset attempted message tracking
    this.attemptedMessageIds = new Set();
    this.permanentlyFailedMessageIds = new Set();
  }

  /**
   * Main deletion loop - searches for messages and deletes them.
   *
   * For 'newest' order (default): searches from offset 0 to handle the "shifting index" problem.
   * For 'oldest' order: uses time-based windows to process messages from oldest to newest.
   *
   * Tracks attempted message IDs to handle stale search index returning
   * already-deleted messages.
   */
  private async runDeletionLoop(): Promise<void> {
    // Use window-based approach for oldest-first ordering
    if (this.options?.deletionOrder === 'oldest') {
      await this.runOldestFirstDeletionLoop();
      return;
    }

    // Default: newest-first ordering
    await this.runNewestFirstDeletionLoop();
  }

  /**
   * Deletion loop for newest-first ordering (default behavior).
   * Uses offset 0 and lets Discord return newest messages first.
   * When permanently failed messages block progress, uses maxId to skip past them.
   */
  private async runNewestFirstDeletionLoop(): Promise<void> {
    let emptyPageRetries = 0;
    let hasMorePages = true;
    // Track maxId for skipping past permanently failed messages
    let skipMaxId: string | undefined;

    while (hasMorePages && !this.stopRequested) {
      // Check for pause
      if (this.state.paused && this.pausePromise) {
        await this.pausePromise;
      }

      if (this.stopRequested) {
        break;
      }

      // Search for messages (always from offset 0, but may use skipMaxId to skip past blocked messages)
      const messages = await this.searchWithRetry(skipMaxId);

      // Filter out messages we've already attempted to delete
      // This handles stale search index returning already-deleted messages
      const newMessages = messages.filter((msg) => !this.attemptedMessageIds.has(msg.id));

      if (newMessages.length === 0) {
        emptyPageRetries++;

        // Check if we should keep trying:
        // 1. If the raw search returned 0 messages, Discord's index is caught up - stop
        // 2. If totalFound > 0 but we got empty filtered results, index might be stale
        const rawSearchReturnedMessages = messages.length > 0;

        // Check if all returned messages are permanently undeletable (threads, permissions, etc.)
        const allPermanentlyFailed =
          rawSearchReturnedMessages &&
          messages.every((msg) => this.permanentlyFailedMessageIds.has(msg.id));

        if (allPermanentlyFailed) {
          // Check if there are likely more messages beyond the permanently failed ones
          // Compare totalFound (remaining messages) to permanently failed count
          // If totalFound > permanently failed, there are messages we haven't tried yet
          const untried = this.state.totalFound - this.permanentlyFailedMessageIds.size;

          if (untried > 0) {
            // There are more messages - skip past the blocked ones using maxId
            // Find the oldest message in the current batch and search before it
            const oldestInBatch = messages.reduce((oldest, msg) =>
              BigInt(msg.id) < BigInt(oldest.id) ? msg : oldest,
            );
            skipMaxId = oldestInBatch.id;
            emptyPageRetries = 0; // Reset retries since we're trying a new search range
            await this.delay(this.getSearchDelay());
            continue;
          }
          // All remaining messages cannot be deleted - exit cleanly
          hasMorePages = false;
          break;
        }

        const apiReportsMoreMessages = this.state.totalFound > 0 && rawSearchReturnedMessages;

        if (emptyPageRetries >= MAX_EMPTY_PAGE_RETRIES && !apiReportsMoreMessages) {
          // No more messages to delete - either API confirms nothing left or index is caught up
          hasMorePages = false;
        } else if (emptyPageRetries >= MAX_EMPTY_PAGE_RETRIES && apiReportsMoreMessages) {
          // API still reports messages but they're all already attempted
          // Only reset retry counter if there are non-permanently-failed messages
          const hasRecoverableMessages = messages.some(
            (msg) => !this.permanentlyFailedMessageIds.has(msg.id),
          );

          if (hasRecoverableMessages) {
            // Discord's index is stale - reset retry counter and keep trying
            emptyPageRetries = Math.floor(MAX_EMPTY_PAGE_RETRIES / 2);
          } else {
            // All remaining messages are permanently failed - check if we should skip
            // Compare totalFound to permanently failed count (not total processed)
            const untried = this.state.totalFound - this.permanentlyFailedMessageIds.size;
            if (untried > 0) {
              // Skip past blocked messages
              const oldestInBatch = messages.reduce((oldest, msg) =>
                BigInt(msg.id) < BigInt(oldest.id) ? msg : oldest,
              );
              skipMaxId = oldestInBatch.id;
              emptyPageRetries = 0;
            } else {
              hasMorePages = false;
            }
          }
        }

        // Use exponential backoff - wait longer with each empty page
        // Base delay * (multiplier ^ retries) e.g., 10s, 13s, 16.9s...
        const backoffDelay = Math.round(
          this.getSearchDelay() * EMPTY_PAGE_BACKOFF_MULTIPLIER ** (emptyPageRetries - 1),
        );
        await this.delay(backoffDelay);
        continue;
      }

      // Reset empty page counter and skipMaxId on successful fetch of new messages
      emptyPageRetries = 0;
      skipMaxId = undefined;

      // Reset empty page counter on successful fetch of new messages
      emptyPageRetries = 0;

      // Filter messages by type and pattern
      const deletableMessages = this.filterDeletableMessages(newMessages);

      // Delete each message (already in newest-first order from Discord)
      await this.deleteMessagesInBatch(deletableMessages);

      // Wait between search requests
      await this.delay(this.getSearchDelay());
    }
  }

  /**
   * Deletion loop for oldest-first ordering.
   * Uses time-based windows to process messages chronologically from oldest to newest.
   */
  private async runOldestFirstDeletionLoop(): Promise<void> {
    // First, find the oldest message to determine our starting point
    const oldestDate = await this.findOldestMessageDate();
    if (!oldestDate) {
      // No messages found
      return;
    }

    // Generate time windows from oldest to newest
    const windows = this.generateTimeWindows(oldestDate);

    // Process each window in order (oldest first)
    for (const window of windows) {
      if (this.stopRequested) {
        break;
      }

      // Process all messages in this time window
      await this.processTimeWindow(window.minId, window.maxId);
    }
  }

  /**
   * Processes all messages within a specific time window.
   * Keeps searching until no more messages are found in the window.
   */
  private async processTimeWindow(windowMinId: string, windowMaxId: string): Promise<void> {
    let emptyPageRetries = 0;
    let hasMoreInWindow = true;

    while (hasMoreInWindow && !this.stopRequested) {
      // Check for pause
      if (this.state.paused && this.pausePromise) {
        await this.pausePromise;
      }

      if (this.stopRequested) {
        break;
      }

      // Search for messages within this window
      const messages = await this.searchWithConstraints(windowMinId, windowMaxId);

      // Filter out messages we've already attempted to delete
      const newMessages = messages.filter((msg) => !this.attemptedMessageIds.has(msg.id));

      if (newMessages.length === 0) {
        emptyPageRetries++;

        // Check if all returned messages are permanently undeletable
        const rawSearchReturnedMessages = messages.length > 0;
        const allPermanentlyFailed =
          rawSearchReturnedMessages &&
          messages.every((msg) => this.permanentlyFailedMessageIds.has(msg.id));

        if (allPermanentlyFailed) {
          // All remaining messages in this window cannot be deleted - move to next window
          hasMoreInWindow = false;
          break;
        }

        if (emptyPageRetries >= MAX_EMPTY_PAGE_RETRIES) {
          // Check if there are recoverable messages before giving up on this window
          const hasRecoverableMessages =
            rawSearchReturnedMessages &&
            messages.some((msg) => !this.permanentlyFailedMessageIds.has(msg.id));

          if (!hasRecoverableMessages) {
            // No more messages in this window
            hasMoreInWindow = false;
          }
          // Otherwise continue with backoff
        }

        // Use exponential backoff
        const backoffDelay = Math.round(
          this.getSearchDelay() * EMPTY_PAGE_BACKOFF_MULTIPLIER ** (emptyPageRetries - 1),
        );
        await this.delay(backoffDelay);
        continue;
      }

      // Reset empty page counter
      emptyPageRetries = 0;

      // Filter messages by type and pattern
      const deletableMessages = this.filterDeletableMessages(newMessages);

      // Sort by ID ascending (oldest first within the batch)
      deletableMessages.sort((a, b) => {
        return BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0;
      });

      // Delete each message
      await this.deleteMessagesInBatch(deletableMessages);

      // Wait between search requests
      await this.delay(this.getSearchDelay());
    }
  }

  /**
   * Deletes a batch of messages, handling pause/stop and tracking progress.
   */
  private async deleteMessagesInBatch(messages: DiscordMessage[]): Promise<void> {
    for (const message of messages) {
      if (this.stopRequested) {
        break;
      }

      // Check for pause
      if (this.state.paused && this.pausePromise) {
        await this.pausePromise;
      }

      if (this.stopRequested) {
        break;
      }

      // Mark this message as attempted before trying to delete
      this.attemptedMessageIds.add(message.id);

      const success = await this.deleteWithRetry(message);

      if (success) {
        this.state.deletedCount++;

        // Track last processed message ID for persistence
        this.lastProcessedMaxId = message.id;

        // Save progress every 10 deletions
        if (shouldSaveProgress(this.state.deletedCount)) {
          this.saveProgressPeriodically();
        }
      } else {
        this.state.failedCount++;
        // Mark as permanently failed (won't retry) - handles 403 errors from threads, permissions, etc.
        this.permanentlyFailedMessageIds.add(message.id);
        this.state.skippedCount++;
      }

      this.callbacks.onProgress?.(this.getState(), this.getStats(), message);

      // Update estimated time remaining
      this.updateEstimatedTime();

      // Wait between deletes
      await this.delay(this.getDeleteDelay());
    }
  }

  /**
   * Searches for messages with retry logic for rate limits.
   *
   * @param overrideMaxId - Optional maxId to use instead of configured one (for skipping past blocked messages)
   */
  private async searchWithRetry(overrideMaxId?: string): Promise<DiscordMessage[]> {
    const maxRetries = this.options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const startTime = Date.now();

        // Safe to access after configure() validation
        const opts = this.options;
        if (!opts) {
          throw new Error('Options not configured');
        }

        // Build search params, only including defined optional properties
        // Always search from offset 0 - we track attempted messages separately
        // to handle the "shifting index" problem when deleting
        const searchParams: Parameters<typeof this.apiClient.searchMessages>[0] = {
          channelId: opts.channelId,
          authorId: opts.authorId,
          offset: 0,
        };
        if (opts.guildId !== undefined) searchParams.guildId = opts.guildId;
        if (opts.content !== undefined) searchParams.content = opts.content;
        if (opts.hasLink !== undefined) searchParams.hasLink = opts.hasLink;
        if (opts.hasFile !== undefined) searchParams.hasFile = opts.hasFile;
        if (opts.minId !== undefined) searchParams.minId = opts.minId;

        // Use overrideMaxId to skip past permanently failed messages, otherwise use configured maxId
        if (overrideMaxId !== undefined) {
          // If both override and configured maxId exist, use the earlier (smaller) one
          if (opts.maxId !== undefined) {
            searchParams.maxId =
              BigInt(overrideMaxId) < BigInt(opts.maxId) ? overrideMaxId : opts.maxId;
          } else {
            searchParams.maxId = overrideMaxId;
          }
        } else if (opts.maxId !== undefined) {
          searchParams.maxId = opts.maxId;
        }

        if (opts.includePinned !== undefined) searchParams.includePinned = opts.includePinned;

        const response = await this.apiClient.searchMessages(searchParams);

        const ping = Date.now() - startTime;
        this.recordPing(ping);

        // Update current total from response
        this.state.totalFound = response.total_results;

        // Set initial total only once on first search (used for progress calculation)
        if (this.state.initialTotalFound === 0) {
          this.state.initialTotalFound = response.total_results;
        }

        // Extract messages from nested array structure
        const messages = response.messages
          .map((group) => group[0])
          .filter((msg): msg is DiscordMessage => msg !== undefined);

        return messages;
      } catch (error) {
        const err = error as Error & { statusCode?: number; retryAfter?: number };

        if (err.statusCode === 429) {
          // Rate limited
          const waitTime = (err.retryAfter ?? 5) * 1000;
          this.stats.throttledCount++;
          this.stats.throttledTime += waitTime;

          await this.delay(waitTime);
          retries++;
        } else {
          // Other error - don't retry
          throw error;
        }
      }
    }

    throw new Error(`Search failed after ${maxRetries} retries`);
  }

  /**
   * Deletes a message with retry logic for rate limits.
   * Implements smooth rate limit recovery with gradual delay adjustment.
   */
  private async deleteWithRetry(message: DiscordMessage): Promise<boolean> {
    const maxRetries = this.options?.maxRetries ?? DEFAULT_MAX_RETRIES;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const startTime = Date.now();

        const response = await this.apiClient.deleteMessage(message.channel_id, message.id);

        const ping = Date.now() - startTime;
        this.recordPing(ping);

        if (response.success) {
          // Handle successful deletion - smooth rate limit recovery
          this.handleSuccessfulDeletion();
        }

        return response.success;
      } catch (error) {
        const err = error as Error & { statusCode?: number; retryAfter?: number };

        if (err.statusCode === 429) {
          // Rate limited - apply throttling
          const retryAfterMs = (err.retryAfter ?? 1) * 1000;
          this.handleRateLimit(retryAfterMs);

          this.stats.throttledCount++;
          this.stats.throttledTime += retryAfterMs;

          await this.delay(retryAfterMs);
          retries++;
        } else if (err.statusCode === 404) {
          // Message already deleted
          return true;
        } else if (err.statusCode === 403) {
          // Permission denied - can't delete this message
          return false;
        } else {
          // Other error - don't retry
          this.callbacks.onError?.(err);
          return false;
        }
      }
    }

    return false;
  }

  /**
   * Handles successful deletion for smooth rate limit recovery.
   * After consecutive successes, gradually decreases delay toward baseline.
   */
  private handleSuccessfulDeletion(): void {
    if (this.isThrottled) {
      this.consecutiveSuccesses++;

      // After threshold consecutive successes, decrease delay by 10% toward baseline
      if (this.consecutiveSuccesses >= THROTTLE_RECOVERY_THRESHOLD) {
        const gap = this.currentDelay - this.baselineDelay;
        const decrease = gap * THROTTLE_RECOVERY_PERCENTAGE;
        this.currentDelay = Math.max(this.baselineDelay, this.currentDelay - decrease);

        // Reset counter for next batch of successes
        this.consecutiveSuccesses = 0;

        // Check if we've recovered to baseline
        if (this.currentDelay <= this.baselineDelay) {
          this.currentDelay = this.baselineDelay;
          this.isThrottled = false;
        }

        // Notify callback of rate limit change
        this.callbacks.onRateLimitChange?.({
          isThrottled: this.isThrottled,
          currentDelay: this.currentDelay,
        });
      }
    }
  }

  /**
   * Handles rate limit (429) response.
   * Increases delay by 50% of the gap toward retry_after value.
   */
  private handleRateLimit(retryAfterMs: number): void {
    const wasThrottled = this.isThrottled;

    this.isThrottled = true;
    this.consecutiveSuccesses = 0;

    // Increase delay by 50% of the gap toward retry_after
    const gap = retryAfterMs - this.currentDelay;
    if (gap > 0) {
      this.currentDelay = this.currentDelay + gap * THROTTLE_INCREASE_PERCENTAGE;
    }

    // Notify callback of rate limit change (only if state changed or this is a new throttle)
    if (!wasThrottled || this.callbacks.onRateLimitChange) {
      this.callbacks.onRateLimitChange?.({
        isThrottled: this.isThrottled,
        currentDelay: this.currentDelay,
      });
    }
  }

  /**
   * Filters messages to only include deletable types and matching patterns.
   */
  private filterDeletableMessages(messages: DiscordMessage[]): DiscordMessage[] {
    return messages.filter((message) => {
      // Check message type
      if (!DELETABLE_MESSAGE_TYPES.has(message.type)) {
        return false;
      }

      // Thread detection: message's channel_id differs from search target
      // Only applies to channel-specific searches (not guild-wide)
      if (
        this.options?.channelId &&
        !this.options.guildId &&
        message.channel_id !== this.options.channelId
      ) {
        // Message is in a thread - mark as permanently failed and skip
        this.permanentlyFailedMessageIds.add(message.id);
        this.attemptedMessageIds.add(message.id);
        this.state.skippedCount++;
        return false;
      }

      // Check pinned status
      if (message.pinned && !this.options?.includePinned) {
        return false;
      }

      // Check regex pattern
      if (this.compiledPattern && !this.compiledPattern.test(message.content)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Records a ping time for average calculation.
   */
  private recordPing(ping: number): void {
    this.pingHistory.push(ping);

    // Keep only last 20 pings for rolling average
    if (this.pingHistory.length > 20) {
      this.pingHistory.shift();
    }

    // Calculate average
    const sum = this.pingHistory.reduce((a, b) => a + b, 0);
    this.stats.averagePing = Math.round(sum / this.pingHistory.length);
  }

  /**
   * Updates the estimated time remaining based on current progress.
   */
  private updateEstimatedTime(): void {
    if (this.state.initialTotalFound === 0 || this.state.deletedCount === 0) {
      this.stats.estimatedTimeRemaining = -1;
      return;
    }

    const elapsedTime = Date.now() - this.stats.startTime;
    const messagesProcessed = this.state.deletedCount + this.state.failedCount;
    const messagesRemaining = this.state.initialTotalFound - messagesProcessed;

    if (messagesProcessed > 0) {
      const timePerMessage = elapsedTime / messagesProcessed;
      this.stats.estimatedTimeRemaining = Math.round(timePerMessage * messagesRemaining);
    }
  }

  /**
   * Returns the configured search delay.
   */
  private getSearchDelay(): number {
    return this.options?.searchDelay ?? DEFAULT_SEARCH_DELAY;
  }

  /**
   * Returns the current delete delay, considering rate limit smoothing.
   * Uses the dynamically adjusted delay when throttled, otherwise uses configured delay.
   */
  private getDeleteDelay(): number {
    // If throttled, use the dynamically adjusted delay
    if (this.isThrottled) {
      return this.currentDelay;
    }
    // Otherwise use configured delay or default
    return this.options?.deleteDelay ?? DEFAULT_DELETE_DELAY;
  }

  /**
   * Finds the oldest message date by binary searching through time.
   * Discord search returns newest first, so we use max_id constraints to find oldest.
   *
   * @returns The date of the oldest message, or null if no messages found
   */
  private async findOldestMessageDate(): Promise<Date | null> {
    const opts = this.options;
    if (!opts) return null;

    // Report status to UI
    this.state.status = 'Finding oldest message...';
    this.reportProgress();

    // Start with a search to get the newest message date AND total count
    // We do this directly (not via searchWithConstraints) to capture total_results
    const searchParams: Parameters<typeof this.apiClient.searchMessages>[0] = {
      channelId: opts.channelId,
      authorId: opts.authorId,
      offset: 0,
    };
    if (opts.guildId !== undefined) searchParams.guildId = opts.guildId;
    if (opts.content !== undefined) searchParams.content = opts.content;
    if (opts.hasLink !== undefined) searchParams.hasLink = opts.hasLink;
    if (opts.hasFile !== undefined) searchParams.hasFile = opts.hasFile;
    if (opts.minId !== undefined) searchParams.minId = opts.minId;
    if (opts.maxId !== undefined) searchParams.maxId = opts.maxId;

    const initialResponse = await this.apiClient.searchMessages(searchParams);

    // Set total found from initial search
    const totalResults = initialResponse.total_results ?? 0;
    if (this.state.initialTotalFound === 0) {
      this.state.initialTotalFound = totalResults;
    }
    this.state.totalFound = totalResults;

    const newestMessage = initialResponse.messages[0]?.[0];
    if (!newestMessage) return null;

    const newestDate = snowflakeToDate(newestMessage.id);

    // Binary search to find the oldest message
    // Start from Discord's epoch (2015-01-01) to the newest message
    const discordEpoch = new Date('2015-01-01T00:00:00.000Z');
    let lowDate = discordEpoch;
    let highDate = newestDate;
    let oldestFound: Date | null = null;

    // Use larger time steps initially for efficiency
    const maxIterations = 20;
    let iterations = 0;

    while (
      iterations < maxIterations &&
      highDate.getTime() - lowDate.getTime() > TIME_WINDOW_SIZE_MS
    ) {
      iterations++;

      // Update status with progress
      this.state.status = `Finding oldest message... (step ${iterations}/${maxIterations})`;
      this.reportProgress();

      const midDate = new Date((lowDate.getTime() + highDate.getTime()) / 2);
      const maxId = dateToSnowflake(midDate);

      // Search for messages before midDate
      const results = await this.searchWithConstraints(undefined, maxId);
      await this.delay(this.getSearchDelay());

      const oldestInBatch = results[results.length - 1];
      if (oldestInBatch) {
        // Found messages before midDate, so oldest is earlier
        // Track the oldest we've found so far
        oldestFound = snowflakeToDate(oldestInBatch.id);
        highDate = midDate;
      } else {
        // No messages before midDate, so oldest is later
        lowDate = midDate;
      }
    }

    // Do a final search in the narrowed range to get the actual oldest
    if (oldestFound === null) {
      // We didn't find anything in binary search, use the newest as oldest
      oldestFound = newestDate;
    }

    // Clear status before returning
    this.state.status = undefined;

    return oldestFound;
  }

  /**
   * Searches for messages with optional min_id/max_id constraints.
   * Used for finding oldest message and window-based deletion.
   */
  private async searchWithConstraints(
    minId: string | undefined,
    maxId: string | undefined,
  ): Promise<DiscordMessage[]> {
    const opts = this.options;
    if (!opts) return [];

    const searchParams: Parameters<typeof this.apiClient.searchMessages>[0] = {
      channelId: opts.channelId,
      authorId: opts.authorId,
      offset: 0,
    };

    if (opts.guildId !== undefined) searchParams.guildId = opts.guildId;
    if (opts.content !== undefined) searchParams.content = opts.content;
    if (opts.hasLink !== undefined) searchParams.hasLink = opts.hasLink;
    if (opts.hasFile !== undefined) searchParams.hasFile = opts.hasFile;
    if (opts.includePinned !== undefined) searchParams.includePinned = opts.includePinned;

    // Apply window constraints, but also respect user's date filters
    if (minId !== undefined) {
      // Use the later of window minId and user's minId
      if (opts.minId !== undefined) {
        searchParams.minId = BigInt(minId) > BigInt(opts.minId) ? minId : opts.minId;
      } else {
        searchParams.minId = minId;
      }
    } else if (opts.minId !== undefined) {
      searchParams.minId = opts.minId;
    }

    if (maxId !== undefined) {
      // Use the earlier of window maxId and user's maxId
      if (opts.maxId !== undefined) {
        searchParams.maxId = BigInt(maxId) < BigInt(opts.maxId) ? maxId : opts.maxId;
      } else {
        searchParams.maxId = maxId;
      }
    } else if (opts.maxId !== undefined) {
      searchParams.maxId = opts.maxId;
    }

    try {
      const response = await this.apiClient.searchMessages(searchParams);
      return response.messages
        .map((group) => group[0])
        .filter((msg): msg is DiscordMessage => msg !== undefined);
    } catch {
      return [];
    }
  }

  /**
   * Generates time windows from oldest to newest date.
   * Each window is TIME_WINDOW_SIZE_MS wide.
   *
   * @param oldestDate - The oldest message date
   * @param newestDate - The newest message date (defaults to now)
   * @returns Array of {minId, maxId} pairs representing time windows
   */
  private generateTimeWindows(
    oldestDate: Date,
    newestDate: Date = new Date(),
  ): Array<{ minId: string; maxId: string }> {
    const windows: Array<{ minId: string; maxId: string }> = [];

    let windowStart = oldestDate.getTime();
    const endTime = newestDate.getTime();

    while (windowStart < endTime) {
      const windowEnd = Math.min(windowStart + TIME_WINDOW_SIZE_MS, endTime + 1);

      windows.push({
        minId: dateToSnowflake(new Date(windowStart)),
        maxId: dateToSnowflake(new Date(windowEnd)),
      });

      windowStart = windowEnd;
    }

    return windows;
  }

  /**
   * Delays execution for the specified time.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Reports status changes to the UI via callback.
   */
  private reportProgress(): void {
    this.callbacks.onStatus?.(this.state.status);
  }
}
