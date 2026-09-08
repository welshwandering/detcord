/**
 * Tests for DeletionEngine.
 *
 * Every stub client follows the API client contract: failures are thrown as
 * `DiscordApiError`, and `deleteMessage` resolves a delete outcome rather than
 * a `{ success }` record. The fake search treats `max_id` as inclusive, which
 * is the harsher of the two possible semantics for cursor pagination.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateToSnowflake } from '../utils/helpers';

const storageState = {
  current: null as Storage | null,
};

vi.mock('./storage', () => ({
  getPageStorage: (): Storage | null => storageState.current,
  resetPageStorage: (): void => {
    storageState.current = null;
  },
}));

import {
  DeletionEngine,
  type DeletionEngineOptions,
  type DeletionStopReason,
  type DiscordApiClient,
  type DiscordMessage,
  type MessageOutcome,
  type RateLimitInfo,
  type SearchParams,
  type SearchResponse,
} from './deletion-engine';
import { DISCORD_ERROR_THREAD_ARCHIVED, DiscordApiError } from './errors';
import type { SavedProgress } from './persistence';

// =============================================================================
// Test doubles
// =============================================================================

const AUTHOR_ID = '111111111111111111';
const CHANNEL_ID = '222222222222222222';

/** Base timestamp for generated snowflakes: 2024-01-01T00:00:00Z. */
const BASE_TIME = Date.UTC(2024, 0, 1);

/** Builds a snowflake `offsetMs` after the base time. */
function snowflakeAt(offsetMs: number): string {
  return dateToSnowflake(new Date(BASE_TIME + offsetMs));
}

function createMessage(overrides: Partial<DiscordMessage> = {}): DiscordMessage {
  return {
    id: snowflakeAt(0),
    channel_id: CHANNEL_ID,
    author: { id: AUTHOR_ID, username: 'testuser', discriminator: '0', avatar: null },
    content: 'Test message content',
    timestamp: new Date(BASE_TIME).toISOString(),
    type: 0,
    pinned: false,
    attachments: [],
    embeds: [],
    ...overrides,
  };
}

/**
 * Creates `count` messages, newest first, one minute apart.
 */
function createMessages(count: number, overrides: Partial<DiscordMessage> = {}): DiscordMessage[] {
  return Array.from({ length: count }, (_, index) =>
    createMessage({ id: snowflakeAt((count - index) * 60_000), ...overrides }),
  );
}

/** Simple in-memory Storage for the persistence-backed tests. */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length(): number {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

/** A queue of scripted failures; `null` entries mean "succeed this call". */
type FailureScript = Array<Error | null>;

/**
 * Models a request that never arrives: it settles only when its signal fires,
 * rejecting with the `ABORTED` error the real client produces for a cancelled
 * `fetch`. Without a signal it never settles at all, so an engine that fails
 * to pass one hangs and `runToCompletion` reports it.
 */
function stallUntilAborted<T>(signal: AbortSignal | undefined): Promise<T> {
  return new Promise<T>((_resolve, reject) => {
    signal?.addEventListener(
      'abort',
      () => reject(new DiscordApiError('ABORTED', 'Request aborted')),
      { once: true },
    );
  });
}

/**
 * Stub Discord API that models a real message store, so cursor pagination is
 * genuinely exercised rather than replayed from a fixed list of pages.
 */
class FakeDiscordApi implements DiscordApiClient {
  messages: DiscordMessage[];
  readonly deletedIds = new Set<string>();
  readonly alreadyGoneIds = new Set<string>();
  readonly searchLog: SearchParams[] = [];
  readonly deleteLog: string[] = [];
  readonly searchSignals: Array<AbortSignal | undefined> = [];
  readonly deleteSignals: Array<AbortSignal | undefined> = [];
  /** Searches to serve before later ones stall; null means never stall. */
  stallSearchesAfter: number | null = null;
  /** Deletes to serve before later ones stall; null means never stall. */
  stallDeletesAfter: number | null = null;
  searchFailures: FailureScript = [];
  deleteFailures: FailureScript = [];
  pageSize = 25;
  rateLimit: RateLimitInfo | null = { remaining: 10, limit: 50, resetAfter: 1 };
  groupFor: ((message: DiscordMessage) => DiscordMessage[]) | null = null;

  constructor(messages: DiscordMessage[] = []) {
    this.messages = messages;
  }

  get searchCount(): number {
    return this.searchLog.length;
  }

  async searchMessages(params: SearchParams, signal?: AbortSignal): Promise<SearchResponse> {
    this.searchLog.push({ ...params });
    this.searchSignals.push(signal);
    if (this.stallSearchesAfter !== null && this.searchLog.length > this.stallSearchesAfter) {
      return stallUntilAborted<SearchResponse>(signal);
    }
    const failure = this.searchFailures.shift();
    if (failure) {
      throw failure;
    }

    const pool = this.messages
      .filter((message) => !this.deletedIds.has(message.id))
      .filter((message) => params.maxId === undefined || BigInt(message.id) <= BigInt(params.maxId))
      .filter((message) => params.minId === undefined || BigInt(message.id) >= BigInt(params.minId))
      .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? 1 : -1));

    return {
      messages: pool.slice(0, this.pageSize).map((m) => this.groupFor?.(m) ?? [m]),
      total_results: pool.length,
    };
  }

  async deleteMessage(
    _channelId: string,
    messageId: string,
    signal?: AbortSignal,
  ): Promise<'deleted' | 'already_gone'> {
    this.deleteLog.push(messageId);
    this.deleteSignals.push(signal);
    if (this.stallDeletesAfter !== null && this.deleteLog.length > this.stallDeletesAfter) {
      return stallUntilAborted<'deleted' | 'already_gone'>(signal);
    }
    const failure = this.deleteFailures.shift();
    if (failure) {
      throw failure;
    }
    this.deletedIds.add(messageId);
    return this.alreadyGoneIds.has(messageId) ? 'already_gone' : 'deleted';
  }

  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimit;
  }
}

function defaultOptions(overrides: Partial<DeletionEngineOptions> = {}): DeletionEngineOptions {
  return {
    authToken: 'test-token',
    authorId: AUTHOR_ID,
    channelId: CHANNEL_ID,
    searchDelay: 5,
    deleteDelay: 2,
    maxRetries: 3,
    ...overrides,
  };
}

/**
 * Drives fake timers until the run settles, failing loudly if it never does.
 * A non-terminating loop shows up here as an explicit failure instead of a hang.
 */
async function runToCompletion(promise: Promise<void>, ticks = 400): Promise<void> {
  let settled = false;
  const tracked = promise.then(
    (value) => {
      settled = true;
      return value;
    },
    (error) => {
      settled = true;
      throw error;
    },
  );
  tracked.catch(() => undefined);

  for (let i = 0; i < ticks && !settled; i++) {
    await vi.advanceTimersByTimeAsync(25);
  }
  if (!settled) {
    throw new Error('deletion run did not terminate');
  }
  return tracked;
}

function rateLimitError(retryAfter: number, global = false): DiscordApiError {
  return new DiscordApiError('RATE_LIMITED', 'Too many requests', {
    httpStatus: 429,
    retryAfter,
    global,
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('DeletionEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storageState.current = createMemoryStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Configuration and guards
  // ---------------------------------------------------------------------------

  describe('configure', () => {
    it('accepts partial updates', () => {
      const engine = new DeletionEngine(new FakeDiscordApi());
      engine.configure(defaultOptions());
      expect(() => engine.configure({ content: 'term' })).not.toThrow();
    });

    it('throws on an invalid regex pattern', () => {
      const engine = new DeletionEngine(new FakeDiscordApi());
      expect(() => engine.configure(defaultOptions({ pattern: '[invalid' }))).toThrow(
        /Invalid regex pattern/,
      );
    });

    it('clears the pattern when set to an empty string', () => {
      const engine = new DeletionEngine(new FakeDiscordApi());
      engine.configure(defaultOptions({ pattern: 'test.*' }));
      expect(() => engine.configure({ pattern: '' })).not.toThrow();
    });

    it('throws when configuring while running', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ searchDelay: 1000 }));

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(1);
      expect(() => engine.configure({ content: 'new' })).toThrow('Cannot configure while running');

      engine.stop();
      await runToCompletion(run);
    });
  });

  describe('start guards', () => {
    it('throws when not configured', async () => {
      const engine = new DeletionEngine(new FakeDiscordApi());
      await expect(engine.start()).rejects.toThrow('Engine not configured');
    });

    it('throws when required options are missing', async () => {
      const engine = new DeletionEngine(new FakeDiscordApi());
      engine.configure({ authToken: 'token' } as DeletionEngineOptions);
      await expect(engine.start()).rejects.toThrow(/Missing required options/);
    });

    it('throws when already running', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ searchDelay: 1000 }));

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(1);
      await expect(engine.start()).rejects.toThrow('Engine is already running');

      engine.stop();
      await runToCompletion(run);
    });
  });

  // ---------------------------------------------------------------------------
  // Newest-first loop: the two reproduced infinite loops
  // ---------------------------------------------------------------------------

  describe('newest-first pagination', () => {
    it('terminates when the only match is pinned and excluded', async () => {
      const api = new FakeDiscordApi([createMessage({ pinned: true })]);
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      const state = engine.getState();
      expect(state.skippedCount).toBe(1);
      expect(state.deletedCount).toBe(0);
      expect(api.deleteLog).toHaveLength(0);
      // The old offset-0 loop re-fetched this page forever.
      expect(api.searchCount).toBeLessThanOrEqual(5);
    });

    it('reaches a match hidden behind a full page of non-matching messages', async () => {
      const messages = createMessages(26);
      const target = messages[25] as DiscordMessage;
      target.content = 'delete me please';

      const api = new FakeDiscordApi(messages);
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ pattern: 'delete me' }));

      await runToCompletion(engine.start());

      expect(api.deleteLog).toEqual([target.id]);
      expect(engine.getState().deletedCount).toBe(1);
      expect(engine.getState().skippedCount).toBe(25);
    });

    it('walks every page and moves the cursor strictly downwards', async () => {
      const messages = createMessages(30);
      const api = new FakeDiscordApi(messages);
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(engine.getState().deletedCount).toBe(30);
      // Page one holds the 25 newest; page two the remaining five. Each cursor
      // is the previous page's oldest id, so nothing is fetched twice.
      const cursors = api.searchLog.map((params) => params.maxId);
      expect(cursors).toEqual([
        undefined,
        (messages[24] as DiscordMessage).id,
        (messages[29] as DiscordMessage).id,
      ]);

      const defined = cursors.filter((id): id is string => id !== undefined);
      expect(defined.length).toBeGreaterThan(1);
      for (let i = 1; i < defined.length; i++) {
        expect(BigInt(defined[i] as string) < BigInt(defined[i - 1] as string)).toBe(true);
      }
    });

    it('stops descending below the configured minId', async () => {
      const messages = createMessages(4);
      const api = new FakeDiscordApi(messages);
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ minId: (messages[1] as DiscordMessage).id }));

      await runToCompletion(engine.start());

      expect(engine.getState().deletedCount).toBe(2);
    });

    it('retries a stale empty page while the server still reports results', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      const engine = new DeletionEngine(api);
      // Report a total without any messages: Discord's index lagging behind.
      vi.spyOn(api, 'searchMessages').mockImplementation(async (params: SearchParams) => {
        api.searchLog.push({ ...params });
        return { messages: [], total_results: 3 };
      });
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(api.searchCount).toBe(1 + 5);
      expect(engine.getState().deletedCount).toBe(0);
    });

    it('records initial and current totals', async () => {
      const api = new FakeDiscordApi(createMessages(3));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(engine.getState().initialTotalFound).toBe(3);
      expect(engine.getState().totalFound).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Error contract
  // ---------------------------------------------------------------------------

  describe('error contract', () => {
    it('retries a rate-limited delete and counts the throttle', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.deleteFailures = [rateLimitError(0.05)];
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(engine.getState().deletedCount).toBe(1);
      expect(engine.getState().failedCount).toBe(0);
      expect(api.deleteLog).toHaveLength(2);
      expect(engine.getStats().throttledCount).toBe(1);
      expect(engine.getStats().throttledTime).toBeGreaterThan(0);
    });

    it('waits at least a second for a global rate limit', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.deleteFailures = [rateLimitError(0, true)];
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(engine.getStats().throttledTime).toBeGreaterThanOrEqual(1000);
      expect(engine.getState().deletedCount).toBe(1);
    });

    it('retries a rate-limited search with every filter intact', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.searchFailures = [rateLimitError(0.05), rateLimitError(0.05)];
      const engine = new DeletionEngine(api);
      engine.configure(
        defaultOptions({
          content: 'term',
          hasLink: true,
          hasFile: true,
          includePinned: true,
          minId: snowflakeAt(0),
        }),
      );

      await runToCompletion(engine.start());

      expect(engine.getState().deletedCount).toBe(1);
      expect(engine.getStats().throttledCount).toBe(2);
      // A retry that rebuilt the params without the filters would widen the
      // search silently and delete messages the user never asked about.
      const attempts = api.searchLog.slice(0, 3);
      expect(attempts[0]).toMatchObject({
        content: 'term',
        hasLink: true,
        hasFile: true,
        includePinned: true,
        minId: snowflakeAt(0),
      });
      expect(attempts[1]).toEqual(attempts[0]);
      expect(attempts[2]).toEqual(attempts[0]);
    });

    it('waits for the search index on a 202 and reports it', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.searchFailures = [
        new DiscordApiError('INDEXING', 'Index building', { httpStatus: 202, retryAfter: 1 }),
      ];
      const statuses: Array<string | undefined> = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onStatus: (status) => statuses.push(status) });
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(statuses).toContain("Waiting for Discord's search index…");
      expect(engine.getState().deletedCount).toBe(1);
    });

    it('gives up after the indexing retry budget is exhausted', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.searchFailures = Array.from(
        { length: 20 },
        () => new DiscordApiError('INDEXING', 'Index building', { httpStatus: 202 }),
      );
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ maxRetries: 2 }));

      await expect(runToCompletion(engine.start())).rejects.toThrow('Index building');
      // maxRetries (2) x 3 tolerated waits, then the seventh aborts.
      expect(api.searchCount).toBe(7);
    });

    it('backs off then aborts the run when search keeps failing with 5xx', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.searchFailures = Array.from(
        { length: 6 },
        () => new DiscordApiError('SERVER_ERROR', 'Bad gateway', { httpStatus: 502 }),
      );
      const stops: DeletionStopReason[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onStop: (_s, _st, result) => stops.push(result.reason) });
      engine.configure(defaultOptions({ maxRetries: 2 }));

      await expect(runToCompletion(engine.start())).rejects.toThrow('Bad gateway');
      expect(stops).toEqual(['error']);
      expect(api.searchCount).toBe(3);
    });

    it('fails a single message when delete keeps failing with a network error', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.deleteFailures = Array.from(
        { length: 6 },
        () => new DiscordApiError('NETWORK_ERROR', 'fetch failed'),
      );
      const outcomes: MessageOutcome[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onProgress: (_s, _st, _m, outcome) => outcomes.push(outcome) });
      engine.configure(defaultOptions({ maxRetries: 2 }));

      await runToCompletion(engine.start());

      expect(engine.getState().failedCount).toBe(1);
      expect(outcomes[0]).toMatchObject({ status: 'failed', code: 'NETWORK_ERROR' });
    });

    it('aborts the whole run on a 401 during search', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.searchFailures = [
        new DiscordApiError('UNAUTHORIZED', 'Invalid token', { httpStatus: 401 }),
      ];
      const errors: Error[] = [];
      const stops: DeletionStopReason[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({
        onError: (error) => errors.push(error),
        onStop: (_s, _st, result) => stops.push(result.reason),
      });
      engine.configure(defaultOptions());

      await expect(runToCompletion(engine.start())).rejects.toThrow('Invalid token');
      expect(errors).toHaveLength(1);
      expect(stops).toEqual(['error']);
      expect(api.searchCount).toBe(1);
    });

    it('aborts the whole run on a 401 during delete', async () => {
      const api = new FakeDiscordApi(createMessages(2));
      api.deleteFailures = [
        new DiscordApiError('UNAUTHORIZED', 'Invalid token', { httpStatus: 401 }),
      ];
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await expect(runToCompletion(engine.start())).rejects.toThrow('Invalid token');
      expect(api.deleteLog).toHaveLength(1);
    });

    it('skips a 403 with the API message', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.deleteFailures = [
        new DiscordApiError('FORBIDDEN', 'Missing permissions', { httpStatus: 403 }),
      ];
      const outcomes: MessageOutcome[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onProgress: (_s, _st, _m, outcome) => outcomes.push(outcome) });
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(outcomes[0]).toEqual({
        status: 'skipped',
        reason: 'Missing permissions',
        code: 'FORBIDDEN',
      });
      expect(engine.getState().skippedCount).toBe(1);
      expect(engine.getState().failedCount).toBe(0);
    });

    it('labels an archived thread 403', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.deleteFailures = [
        new DiscordApiError('FORBIDDEN', 'Thread is archived', {
          httpStatus: 403,
          discordCode: DISCORD_ERROR_THREAD_ARCHIVED,
        }),
      ];
      const outcomes: MessageOutcome[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onProgress: (_s, _st, _m, outcome) => outcomes.push(outcome) });
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(outcomes[0]?.reason).toBe('Archived thread');
    });

    it('counts an already-gone message without failing it', async () => {
      const messages = createMessages(1);
      const api = new FakeDiscordApi(messages);
      api.alreadyGoneIds.add((messages[0] as DiscordMessage).id);
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(engine.getState().alreadyGoneCount).toBe(1);
      expect(engine.getState().failedCount).toBe(0);
      expect(engine.getState().deletedCount).toBe(0);
    });

    it('treats a thrown 404 as already gone', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.deleteFailures = [
        new DiscordApiError('NOT_FOUND', 'Unknown Message', { httpStatus: 404 }),
      ];
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(engine.getState().alreadyGoneCount).toBe(1);
      expect(engine.getState().failedCount).toBe(0);
    });

    it('fails an unknown 4xx delete', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.deleteFailures = [new DiscordApiError('UNKNOWN', 'Bad request', { httpStatus: 400 })];
      const outcomes: MessageOutcome[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onProgress: (_s, _st, _m, outcome) => outcomes.push(outcome) });
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(outcomes[0]).toMatchObject({ status: 'failed', code: 'UNKNOWN' });
    });

    it('rethrows a non-API error from search', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.searchFailures = [new TypeError('boom')];
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await expect(runToCompletion(engine.start())).rejects.toThrow('boom');
    });

    it('rethrows a non-API error from delete', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.deleteFailures = [new TypeError('boom')];
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await expect(runToCompletion(engine.start())).rejects.toThrow('boom');
    });

    it('waits for the bucket to reset when the header says none remain', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.rateLimit = { remaining: 0, limit: 5, resetAfter: 0.05 };
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(engine.getState().deletedCount).toBe(1);
    });

    it('issues no request until the exhausted bucket has reset', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.rateLimit = { remaining: 0, limit: 5, resetAfter: 30 };
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(29_000);
      // Spending a request into an empty bucket buys a 429 and a longer wait.
      expect(api.searchCount).toBe(0);

      await vi.advanceTimersByTimeAsync(1_500);
      expect(api.searchCount).toBe(1);
      expect(api.deleteLog).toHaveLength(0);

      engine.stop();
      await runToCompletion(run);
    });

    it('ignores rate limit headers with a useless resetAfter', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.rateLimit = { remaining: 0, limit: 5, resetAfter: 0 };
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(engine.getState().deletedCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Ownership and client-side filters
  // ---------------------------------------------------------------------------

  describe('filters and ownership', () => {
    it('prefers the hit member of a search group over the first', async () => {
      const own = createMessage({ id: snowflakeAt(60_000), hit: true, content: 'mine' });
      const foreign = createMessage({
        id: snowflakeAt(30_000),
        author: { id: '999999999999999999', username: 'someone', discriminator: '0', avatar: null },
        content: 'context',
      });

      const api = new FakeDiscordApi([own]);
      api.groupFor = (message) => [foreign, message];
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(api.deleteLog).toEqual([own.id]);
      expect(engine.getState().deletedCount).toBe(1);
    });

    it('skips a message that is not authored by the current user', async () => {
      const foreign = createMessage({
        author: { id: '999999999999999999', username: 'someone', discriminator: '0', avatar: null },
      });
      const api = new FakeDiscordApi([foreign]);
      const outcomes: MessageOutcome[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onProgress: (_s, _st, _m, outcome) => outcomes.push(outcome) });
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(api.deleteLog).toHaveLength(0);
      expect(outcomes[0]).toEqual({ status: 'skipped', reason: 'Not authored by current user' });
    });

    it('skips undeletable message types', async () => {
      const api = new FakeDiscordApi([createMessage({ type: 3 })]);
      const outcomes: MessageOutcome[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onProgress: (_s, _st, _m, outcome) => outcomes.push(outcome) });
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(outcomes[0]?.reason).toMatch(/cannot be deleted/);
      expect(api.deleteLog).toHaveLength(0);
    });

    it('skips messages that live in a thread of the target channel', async () => {
      const api = new FakeDiscordApi([createMessage({ channel_id: '333333333333333333' })]);
      const outcomes: MessageOutcome[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onProgress: (_s, _st, _m, outcome) => outcomes.push(outcome) });
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(outcomes[0]?.reason).toBe('Message is in a thread');
    });

    it('deletes pinned messages when includePinned is set', async () => {
      const api = new FakeDiscordApi([createMessage({ pinned: true })]);
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ includePinned: true }));

      await runToCompletion(engine.start());

      expect(engine.getState().deletedCount).toBe(1);
    });

    it('reports an outcome for every processed message', async () => {
      const messages = [
        createMessage({ id: snowflakeAt(180_000), content: 'keep this' }),
        createMessage({ id: snowflakeAt(120_000), content: 'target one' }),
        createMessage({ id: snowflakeAt(60_000), pinned: true, content: 'target two' }),
      ];
      const api = new FakeDiscordApi(messages);
      const outcomes: MessageOutcome[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onProgress: (_s, _st, _m, outcome) => outcomes.push(outcome) });
      engine.configure(defaultOptions({ pattern: 'target' }));

      await runToCompletion(engine.start());

      expect(outcomes.map((outcome) => outcome.status)).toEqual(['skipped', 'deleted', 'skipped']);
    });
  });

  // ---------------------------------------------------------------------------
  // Stop, pause, resume
  // ---------------------------------------------------------------------------

  describe('stop and pause', () => {
    it('aborts a long wait immediately instead of running out the timer', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ searchDelay: 10_000, deleteDelay: 1 }));

      let settled = false;
      const run = engine.start().then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(20);
      expect(settled).toBe(false);

      engine.stop();
      await vi.advanceTimersByTimeAsync(5);

      expect(settled).toBe(true);
      await run;
    });

    it('reports the stopped reason and leaves the engine idle', async () => {
      const api = new FakeDiscordApi(createMessages(5));
      const stops: DeletionStopReason[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onStop: (_s, _st, result) => stops.push(result.reason) });
      engine.configure(defaultOptions({ searchDelay: 1000 }));

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(10);
      engine.stop();
      await runToCompletion(run);

      expect(stops).toEqual(['stopped']);
      expect(engine.getState().running).toBe(false);
    });

    it('reports completion when the range is exhausted', async () => {
      const api = new FakeDiscordApi(createMessages(2));
      const stops: DeletionStopReason[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onStop: (_s, _st, result) => stops.push(result.reason) });
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(stops).toEqual(['completed']);
    });

    it('holds while paused and continues after resume', async () => {
      const api = new FakeDiscordApi(createMessages(6));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(3);
      engine.pause();
      expect(engine.getState().paused).toBe(true);

      const deletedWhilePaused = api.deleteLog.length;
      await vi.advanceTimersByTimeAsync(200);
      expect(api.deleteLog.length).toBe(deletedWhilePaused);

      engine.resume();
      await runToCompletion(run);
      expect(engine.getState().deletedCount).toBe(6);
    });

    it('ignores pause and resume when idle', () => {
      const engine = new DeletionEngine(new FakeDiscordApi());
      engine.configure(defaultOptions());
      expect(() => engine.pause()).not.toThrow();
      expect(() => engine.resume()).not.toThrow();
      expect(engine.getState().paused).toBe(false);
    });

    it('unblocks a paused run when stopped', async () => {
      const api = new FakeDiscordApi(createMessages(6));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(3);
      engine.pause();
      engine.stop();

      await runToCompletion(run);
      expect(engine.getState().running).toBe(false);
    });

    it('issues no delete when a stop lands during the proactive rate limit wait', async () => {
      // Reproduction: the abort ended the wait, and execution fell straight
      // into the DELETE the wait was meant to hold back.
      const api = new FakeDiscordApi(createMessages(3));
      const realSearch = api.searchMessages.bind(api);
      vi.spyOn(api, 'searchMessages').mockImplementation(async (params: SearchParams) => {
        const response = await realSearch(params);
        api.rateLimit = { remaining: 0, limit: 5, resetAfter: 30 };
        return response;
      });
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(api.deleteLog).toHaveLength(0);

      engine.stop();
      await runToCompletion(run);

      expect(api.deleteLog).toHaveLength(0);
      expect(engine.getState().deletedCount).toBe(0);
      expect(engine.getState().skippedCount).toBe(0);
    });

    it('holds a rate limited retry while paused and resumes it afterwards', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.deleteFailures = [rateLimitError(1)];
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(5);
      expect(api.deleteLog).toHaveLength(1);

      engine.pause();
      await vi.advanceTimersByTimeAsync(5_000);
      // The 429 wait is long over; only the pause is holding the retry back.
      expect(api.deleteLog).toHaveLength(1);

      engine.resume();
      await runToCompletion(run);

      expect(api.deleteLog).toHaveLength(2);
      expect(engine.getState().deletedCount).toBe(1);
    });

    it('records nothing for a message abandoned mid-retry and deletes it once on resume', async () => {
      const api = new FakeDiscordApi(createMessages(2));
      api.deleteFailures = [
        new DiscordApiError('SERVER_ERROR', 'Bad gateway', { httpStatus: 502 }),
      ];
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ searchDelay: 10_000 }));

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(5);
      expect(api.deleteLog).toHaveLength(1);

      engine.stop();
      await runToCompletion(run);

      // A stop during the backoff is not a skip, a failure or a deletion.
      expect(engine.getState().deletedCount).toBe(0);
      expect(engine.getState().skippedCount).toBe(0);
      expect(engine.getState().failedCount).toBe(0);

      const saved = engine.loadSavedSession() as SavedProgress;
      expect(saved.deletedCount).toBe(0);

      const resumed = new DeletionEngine(api);
      resumed.configure(defaultOptions());
      resumed.resumeFromSaved(saved);
      await runToCompletion(resumed.start());

      expect(api.deletedIds.size).toBe(2);
      expect(resumed.getState().deletedCount).toBe(2);
      expect(resumed.getState().skippedCount).toBe(0);
    });

    it('issues no further delete when stopped during the delete delay', async () => {
      const api = new FakeDiscordApi(createMessages(5));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ deleteDelay: 1_000, searchDelay: 10_000 }));

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(500);
      expect(api.deleteLog).toHaveLength(1);

      engine.stop();
      await runToCompletion(run);

      expect(api.deleteLog).toHaveLength(1);
      expect(engine.getState().deletedCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Stop cancels the request in flight, not just the waits between requests
  // ---------------------------------------------------------------------------

  describe('stop with a request in flight', () => {
    /** Advances far enough for the abort to unwind, but not for any retry. */
    async function settleStop(): Promise<void> {
      await vi.advanceTimersByTimeAsync(1);
    }

    it('hands every request the run signal that Stop aborts', async () => {
      // Mutation guard: an engine that omits the signal records `undefined`
      // here, and nothing below can hold.
      const api = new FakeDiscordApi(createMessages(2));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ searchDelay: 10_000, deleteDelay: 10_000 }));

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(5);

      const searchSignal = api.searchSignals[0];
      expect(searchSignal).toBeInstanceOf(AbortSignal);
      expect(api.deleteSignals[0]).toBe(searchSignal);
      expect(searchSignal?.aborted).toBe(false);

      engine.stop();
      expect(searchSignal?.aborted).toBe(true);

      await runToCompletion(run);
    });

    it('abandons a stalled delete instead of waiting for it to settle', async () => {
      // Reproduction: the signal never reached fetch, so Stop ended the timer
      // waits but left the run parked on the in-flight DELETE.
      const api = new FakeDiscordApi(createMessages(3));
      api.stallDeletesAfter = 1;
      const stops: DeletionStopReason[] = [];
      const errors: Error[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({
        onStop: (_s, _st, result) => stops.push(result.reason),
        onError: (error) => errors.push(error),
      });
      engine.configure(defaultOptions({ searchDelay: 10_000 }));

      let settled = false;
      const run = engine.start().then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(5);
      expect(api.deleteLog).toHaveLength(2);
      expect(engine.getState().running).toBe(true);

      engine.stop();
      await settleStop();

      expect(settled).toBe(true);
      expect(engine.getState().running).toBe(false);
      expect(stops).toEqual(['stopped']);
      expect(errors).toEqual([]);

      // The aborted message is neither deleted nor failed nor skipped.
      const state = engine.getState();
      expect(state.deletedCount).toBe(1);
      expect(state.failedCount).toBe(0);
      expect(state.skippedCount).toBe(0);

      const saved = engine.loadSavedSession() as SavedProgress;
      expect(saved.deletedCount).toBe(1);
      await run;
    });

    it('deletes the abandoned message once when the run is resumed', async () => {
      const api = new FakeDiscordApi(createMessages(3));
      api.stallDeletesAfter = 1;
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ searchDelay: 10_000 }));

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(5);
      engine.stop();
      await runToCompletion(run);

      const saved = engine.loadSavedSession() as SavedProgress;
      api.stallDeletesAfter = null;

      const resumed = new DeletionEngine(api);
      resumed.configure(defaultOptions());
      resumed.resumeFromSaved(saved);
      await runToCompletion(resumed.start());

      expect(api.deletedIds.size).toBe(3);
      expect(resumed.getState().deletedCount).toBe(3);
      expect(resumed.getState().failedCount).toBe(0);
      expect(resumed.getState().skippedCount).toBe(0);
    });

    it('abandons a stalled search instead of waiting for it to settle', async () => {
      const api = new FakeDiscordApi(createMessages(3));
      api.stallSearchesAfter = 0;
      const stops: DeletionStopReason[] = [];
      const errors: Error[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({
        onStop: (_s, _st, result) => stops.push(result.reason),
        onError: (error) => errors.push(error),
      });
      engine.configure(defaultOptions());

      let settled = false;
      const run = engine.start().then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(5);
      expect(api.searchLog).toHaveLength(1);
      expect(engine.getState().running).toBe(true);

      engine.stop();
      await settleStop();

      expect(settled).toBe(true);
      expect(engine.getState().running).toBe(false);
      expect(stops).toEqual(['stopped']);
      expect(errors).toEqual([]);
      // An abort is not an empty page: no retry search is issued.
      expect(api.searchLog).toHaveLength(1);
      expect(api.deleteLog).toHaveLength(0);
      expect(engine.loadSavedSession()).not.toBeNull();
      await run;
    });
  });

  // ---------------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------------

  describe('preview', () => {
    it('returns the server total and flags client-side filtering', async () => {
      const messages = createMessages(3);
      (messages[0] as DiscordMessage).content = 'keep';
      const api = new FakeDiscordApi(messages);
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ pattern: 'Test', includePinned: true }));

      const preview = await engine.preview();

      expect(preview.totalCount).toBe(3);
      expect(preview.sampleMessages).toHaveLength(2);
      expect(preview.filtersApplied).toBe(true);
      expect(preview.estimatedTimeMs).toBeGreaterThan(0);
    });

    it('reports no filtering when the sample is the whole result set', async () => {
      const api = new FakeDiscordApi(createMessages(2));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ includePinned: true }));

      const preview = await engine.preview();

      expect(preview.filtersApplied).toBe(false);
      expect(preview.sampleMessages).toHaveLength(2);
    });

    it('flags filtering when a sampled message is excluded', async () => {
      const messages = createMessages(2);
      (messages[0] as DiscordMessage).pinned = true;
      const api = new FakeDiscordApi(messages);
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      expect((await engine.preview()).filtersApplied).toBe(true);
    });

    it('flags filtering when the result set is larger than the sampled page', async () => {
      // Nothing in the first page is excluded, but the unseen remainder still
      // can be: reporting an exact count there would overstate the run.
      const api = new FakeDiscordApi(createMessages(30));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ includePinned: true }));

      const preview = await engine.preview();

      expect(preview.totalCount).toBe(30);
      expect(preview.filtersApplied).toBe(true);
    });

    it('caps the sample at ten messages', async () => {
      const api = new FakeDiscordApi(createMessages(20));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ includePinned: true }));

      expect((await engine.preview()).sampleMessages).toHaveLength(10);
    });

    it('throws when unconfigured', async () => {
      const engine = new DeletionEngine(new FakeDiscordApi());
      await expect(engine.preview()).rejects.toThrow('Engine not configured');
    });

    it('throws while running', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ searchDelay: 1000 }));

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(1);
      await expect(engine.preview()).rejects.toThrow('Cannot preview while running');

      engine.stop();
      await runToCompletion(run);
    });
  });

  // ---------------------------------------------------------------------------
  // Persistence and resume
  // ---------------------------------------------------------------------------

  describe('persistence', () => {
    function savedSession(overrides: Partial<SavedProgress> = {}): SavedProgress {
      return {
        version: 2,
        runId: 'saved-run',
        authorId: AUTHOR_ID,
        channelId: CHANNEL_ID,
        deletionOrder: 'newest',
        cursor: { maxId: snowflakeAt(200 * 60_000) },
        deletedCount: 50,
        failedCount: 0,
        skippedCount: 0,
        alreadyGoneCount: 0,
        totalFound: 50,
        initialTotalFound: 100,
        timestamp: Date.now(),
        ...overrides,
      };
    }

    it('preserves restored counters and resumes from the saved cursor', async () => {
      const messages = createMessages(4);
      const api = new FakeDiscordApi(messages);
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      const saved = savedSession({ cursor: { maxId: (messages[1] as DiscordMessage).id } });
      engine.resumeFromSaved(saved);

      await runToCompletion(engine.start());

      expect(api.searchLog[0]?.maxId).toBe((messages[1] as DiscordMessage).id);
      // 50 carried over plus the three messages at or below the cursor.
      expect(engine.getState().deletedCount).toBe(53);
      expect(engine.getState().initialTotalFound).toBe(100);
    });

    it('restores saved filters and the oldest-first minId cursor', () => {
      const engine = new DeletionEngine(new FakeDiscordApi());
      engine.configure(defaultOptions());
      engine.resumeFromSaved(
        savedSession({
          deletionOrder: 'oldest',
          cursor: { minId: snowflakeAt(60_000) },
          guildId: '444444444444444444',
          filters: {
            content: 'term',
            hasLink: true,
            hasFile: false,
            includePinned: true,
            pattern: 'a.*b',
            minId: snowflakeAt(0),
            maxId: snowflakeAt(600_000),
          },
        }),
      );

      expect(() => engine.configure({})).not.toThrow();
    });

    it('throws when resuming while running', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ searchDelay: 1000 }));

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(1);
      expect(() => engine.resumeFromSaved(savedSession())).toThrow('Cannot resume while running');

      engine.stop();
      await runToCompletion(run);
    });

    it('finds a session it saved on stop', async () => {
      const api = new FakeDiscordApi(createMessages(5));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ searchDelay: 1000 }));

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(10);
      engine.stop();
      await runToCompletion(run);

      expect(engine.hasSavedSession()).toBe(true);
      const saved = engine.loadSavedSession();
      expect(saved?.version).toBe(2);
      expect(saved?.deletionOrder).toBe('newest');
      expect(saved?.deletedCount).toBeGreaterThan(0);
      expect(saved?.cursor.maxId).toBeDefined();
    });

    it('does not advance the saved cursor past messages left unprocessed by a stop', async () => {
      // Found by a browser run: stopping mid-page saved the page's bottom id as the
      // cursor, so the resumed run searched below it and declared "All clean!".
      const messages = createMessages(8);
      const api = new FakeDiscordApi(messages);
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ deleteDelay: 1000, searchDelay: 10_000 }));

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(2500);
      expect(api.deleteLog).toHaveLength(3);
      engine.stop();
      await runToCompletion(run);

      const saved = engine.loadSavedSession();
      expect(saved?.deletedCount).toBe(3);
      const cursor = saved?.cursor.maxId;
      const unprocessed = messages.slice(3);
      for (const message of unprocessed) {
        // Every unprocessed message must still fall inside the saved cursor's range.
        expect(cursor === undefined || BigInt(message.id) <= BigInt(cursor)).toBe(true);
      }

      const resumed = new DeletionEngine(api);
      resumed.configure(defaultOptions());
      resumed.resumeFromSaved(saved as SavedProgress);
      await runToCompletion(resumed.start());

      expect(api.deletedIds.size).toBe(8);
      expect(resumed.getState().deletedCount).toBe(8);
      expect(resumed.hasSavedSession()).toBe(false);
    });

    it('saves at exactly ten deletions and again on stop', async () => {
      const storage = createMemoryStorage();
      const setItem = vi.spyOn(storage, 'setItem');
      storageState.current = storage;

      const api = new FakeDiscordApi(createMessages(12));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ deleteDelay: 1000, searchDelay: 10_000 }));

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(8500);
      expect(api.deleteLog).toHaveLength(9);
      expect(setItem).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      expect(api.deleteLog).toHaveLength(10);
      expect(setItem).toHaveBeenCalledTimes(1);
      const written = JSON.parse(setItem.mock.calls[0]?.[1] ?? '{}') as SavedProgress;
      expect(written.deletedCount).toBe(10);

      const savesBeforeStop = setItem.mock.calls.length;
      engine.stop();
      await runToCompletion(run);

      expect(setItem.mock.calls.length).toBeGreaterThan(savesBeforeStop);
      expect(engine.loadSavedSession()?.deletedCount).toBe(10);
    });

    it('clears the saved session when the run completes', async () => {
      const api = new FakeDiscordApi(createMessages(2));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(engine.hasSavedSession()).toBe(false);
    });

    it('leaves a checkpoint written by another run in place on completion', async () => {
      // Same account, same channel, second tab: completing here must not wipe
      // the cursor the other run is still using.
      const storage = createMemoryStorage();
      storageState.current = storage;
      const foreign = savedSession({ runId: 'other-tab', deletedCount: 7 });
      storage.setItem(`detcord_progress:v2:${AUTHOR_ID}:c:${CHANNEL_ID}`, JSON.stringify(foreign));

      const api = new FakeDiscordApi(createMessages(2));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(engine.loadSavedSession()?.runId).toBe('other-tab');
    });

    it('saves an oldest-first cursor one past the last deleted id', async () => {
      const messages = createMessages(3);
      const api = new FakeDiscordApi(messages);
      const engine = new DeletionEngine(api);
      engine.configure(
        defaultOptions({ deletionOrder: 'oldest', searchDelay: 1, deleteDelay: 5000 }),
      );

      const run = engine.start();
      await vi.advanceTimersByTimeAsync(300);
      expect(api.deleteLog).toEqual([(messages[2] as DiscordMessage).id]);
      engine.stop();
      await runToCompletion(run);

      const saved = engine.loadSavedSession();
      expect(saved?.deletionOrder).toBe('oldest');
      expect(saved?.cursor.maxId).toBeUndefined();
      expect(BigInt(saved?.cursor.minId as string)).toBe(
        BigInt((messages[2] as DiscordMessage).id) + 1n,
      );
    });

    it('reports no saved session before configuration', () => {
      const engine = new DeletionEngine(new FakeDiscordApi());
      expect(engine.hasSavedSession()).toBe(false);
      expect(engine.loadSavedSession()).toBeNull();
      expect(() => engine.clearSavedSession()).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Oldest-first
  // ---------------------------------------------------------------------------

  describe('oldest-first ordering', () => {
    it('reaches an older deletable message behind a blocked first page', async () => {
      const messages = createMessages(26, { pinned: true });
      const target = messages[25] as DiscordMessage;
      target.pinned = false;

      const api = new FakeDiscordApi(messages);
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ deletionOrder: 'oldest', searchDelay: 1 }));

      await runToCompletion(engine.start(), 800);

      expect(api.deleteLog).toEqual([target.id]);
      expect(engine.getState().skippedCount).toBe(25);
    });

    it('deletes oldest first within a window', async () => {
      const messages = createMessages(3);
      const api = new FakeDiscordApi(messages);
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ deletionOrder: 'oldest', searchDelay: 1 }));

      await runToCompletion(engine.start(), 800);

      expect(api.deleteLog).toEqual([
        (messages[2] as DiscordMessage).id,
        (messages[1] as DiscordMessage).id,
        (messages[0] as DiscordMessage).id,
      ]);
    });

    it('ends cleanly when there is nothing to delete', async () => {
      const api = new FakeDiscordApi([]);
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ deletionOrder: 'oldest', searchDelay: 1 }));

      await runToCompletion(engine.start());

      expect(engine.getState().deletedCount).toBe(0);
      expect(api.searchCount).toBe(1);
    });

    it('propagates a search error raised during discovery', async () => {
      const api = new FakeDiscordApi(createMessages(2));
      api.searchFailures = [
        new DiscordApiError('UNAUTHORIZED', 'Invalid token', { httpStatus: 401 }),
      ];
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ deletionOrder: 'oldest', searchDelay: 1 }));

      await expect(runToCompletion(engine.start())).rejects.toThrow('Invalid token');
    });

    it('stops promptly during oldest-message discovery', async () => {
      const api = new FakeDiscordApi(createMessages(2));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions({ deletionOrder: 'oldest', searchDelay: 10_000 }));

      let settled = false;
      const run = engine.start().then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(5);
      expect(settled).toBe(false);

      engine.stop();
      await vi.advanceTimersByTimeAsync(5);

      expect(settled).toBe(true);
      expect(engine.getState().running).toBe(false);
      await run;
    });
  });

  // ---------------------------------------------------------------------------
  // Statistics and callbacks
  // ---------------------------------------------------------------------------

  describe('statistics', () => {
    it('tracks ping and estimated time', async () => {
      const api = new FakeDiscordApi(createMessages(4));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      const stats = engine.getStats();
      expect(stats.startTime).toBeGreaterThan(0);
      expect(stats.averagePing).toBeGreaterThanOrEqual(0);
      expect(stats.estimatedTimeRemaining).toBeGreaterThanOrEqual(0);
    });

    it('notifies the UI when throttling changes the delete delay', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      api.deleteFailures = [rateLimitError(2)];
      const changes: Array<{ isThrottled: boolean; currentDelay: number }> = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onRateLimitChange: (info) => changes.push(info) });
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(changes[0]?.isThrottled).toBe(true);
      expect(changes[0]?.currentDelay).toBeGreaterThan(2);
    });

    it('eases the delay back toward baseline after sustained success', async () => {
      const api = new FakeDiscordApi(createMessages(8));
      api.deleteFailures = [rateLimitError(0.05)];
      const changes: Array<{ isThrottled: boolean; currentDelay: number }> = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onRateLimitChange: (info) => changes.push(info) });
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(changes.length).toBeGreaterThan(1);
      expect(engine.getState().deletedCount).toBe(8);
    });

    it('gives back a tenth of the current delay after five clean deletions', async () => {
      // Jitter fixed at its floor so the throttled delay lands on exactly 2s:
      // 2.95s retry_after + 50ms jitter = 3s, half the gap above the 1s
      // baseline. Five clean deletions must then return 10% of 2000, not 10%
      // of the 1000ms gap above baseline.
      const random = vi.spyOn(Math, 'random').mockReturnValue(0);
      try {
        const api = new FakeDiscordApi(createMessages(5));
        api.deleteFailures = [rateLimitError(2.95)];
        const changes: Array<{ isThrottled: boolean; currentDelay: number }> = [];
        const engine = new DeletionEngine(api);
        engine.setCallbacks({ onRateLimitChange: (info) => changes.push(info) });
        engine.configure(defaultOptions());

        await runToCompletion(engine.start(), 1200);

        expect(engine.getState().deletedCount).toBe(5);
        expect(changes[0]).toEqual({ isThrottled: true, currentDelay: 2000 });
        expect(changes[1]).toEqual({ isThrottled: true, currentDelay: 1800 });
      } finally {
        random.mockRestore();
      }
    });

    it('fires onStart once with the initial state', async () => {
      const api = new FakeDiscordApi(createMessages(1));
      const starts: number[] = [];
      const engine = new DeletionEngine(api);
      engine.setCallbacks({ onStart: (state) => starts.push(state.deletedCount) });
      engine.configure(defaultOptions());

      await runToCompletion(engine.start());

      expect(starts).toEqual([0]);
    });

    it('runs without any callbacks registered', async () => {
      const api = new FakeDiscordApi(createMessages(2));
      const engine = new DeletionEngine(api);
      engine.configure(defaultOptions());

      await expect(runToCompletion(engine.start())).resolves.toBeUndefined();
      expect(engine.getState().deletedCount).toBe(2);
    });
  });
});
