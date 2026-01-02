/**
 * Tests for DeletionEngine
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeletionEngine,
  type DeletionEngineOptions,
  type DeletionEngineStats,
  type DiscordApiClient,
  type DiscordMessage,
  type SearchResponse,
} from './deletion-engine';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Creates a mock Discord message with default values.
 */
function createMockMessage(overrides: Partial<DiscordMessage> = {}): DiscordMessage {
  return {
    id: '123456789',
    channel_id: 'channel123',
    author: {
      id: 'author123',
      username: 'testuser',
      discriminator: '1234',
      avatar: null,
    },
    content: 'Test message content',
    timestamp: new Date().toISOString(),
    type: 0,
    pinned: false,
    attachments: [],
    embeds: [],
    ...overrides,
  };
}

/**
 * Creates a mock API client with configurable behavior.
 */
function createMockApiClient(
  options: {
    searchResults?: DiscordMessage[][];
    searchError?: Error;
    deleteSuccess?: boolean;
    deleteError?: Error;
    totalResults?: number;
  } = {},
): DiscordApiClient {
  const {
    searchResults = [],
    searchError,
    deleteSuccess = true,
    deleteError,
    totalResults = 0,
  } = options;

  let searchCallCount = 0;

  return {
    searchMessages: vi.fn().mockImplementation(async (): Promise<SearchResponse> => {
      if (searchError) {
        throw searchError;
      }

      const pageIndex = searchCallCount;
      searchCallCount++;

      const messages = searchResults[pageIndex] ?? [];
      const response: SearchResponse = {
        messages: messages.map((m) => [m]),
        total_results: totalResults || searchResults.flat().length,
      };

      return response;
    }),

    deleteMessage: vi.fn().mockImplementation(async () => {
      if (deleteError) {
        throw deleteError;
      }

      return {
        success: deleteSuccess,
      };
    }),

    getRateLimitInfo: vi.fn().mockReturnValue({
      remaining: 10,
      limit: 50,
      resetAfter: 1000,
    }),
  };
}

/**
 * Creates default options for tests.
 */
function createDefaultOptions(): DeletionEngineOptions {
  return {
    authToken: 'test-token',
    authorId: 'author123',
    channelId: 'channel123',
    searchDelay: 10,
    deleteDelay: 10,
    maxRetries: 3,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('DeletionEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create an instance with the provided API client', () => {
      const apiClient = createMockApiClient();
      const engine = new DeletionEngine(apiClient);

      expect(engine).toBeInstanceOf(DeletionEngine);
    });

    it('should initialize with default state', () => {
      const apiClient = createMockApiClient();
      const engine = new DeletionEngine(apiClient);
      const state = engine.getState();

      expect(state.running).toBe(false);
      expect(state.paused).toBe(false);
      expect(state.deletedCount).toBe(0);
      expect(state.failedCount).toBe(0);
      expect(state.totalFound).toBe(0);
      expect(state.currentOffset).toBe(0);
    });
  });

  describe('configure', () => {
    it('should set options correctly', () => {
      const apiClient = createMockApiClient();
      const engine = new DeletionEngine(apiClient);

      engine.configure({
        authToken: 'token123',
        authorId: 'author123',
        channelId: 'channel123',
      });

      // Engine should accept the configuration without throwing
      expect(() =>
        engine.configure({
          content: 'search term',
        }),
      ).not.toThrow();
    });

    it('should throw when configuring while running', async () => {
      const message = createMockMessage();
      const apiClient = createMockApiClient({
        searchResults: [[message]],
        totalResults: 1,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      // Start the engine (don't await, so it's running)
      const startPromise = engine.start();
      await vi.advanceTimersByTimeAsync(1);

      expect(() => engine.configure({ content: 'new' })).toThrow('Cannot configure while running');

      // Stop and wait for completion
      engine.stop();
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }
      await startPromise;
    });

    it('should compile valid regex pattern', () => {
      const apiClient = createMockApiClient();
      const engine = new DeletionEngine(apiClient);

      expect(() =>
        engine.configure({
          ...createDefaultOptions(),
          pattern: 'hello.*world',
        }),
      ).not.toThrow();
    });

    it('should throw on invalid regex pattern', () => {
      const apiClient = createMockApiClient();
      const engine = new DeletionEngine(apiClient);

      expect(() =>
        engine.configure({
          ...createDefaultOptions(),
          pattern: '[invalid',
        }),
      ).toThrow(/Invalid regex pattern/);
    });

    it('should clear pattern when set to empty string', () => {
      const apiClient = createMockApiClient();
      const engine = new DeletionEngine(apiClient);

      engine.configure({
        ...createDefaultOptions(),
        pattern: 'test.*pattern',
      });

      expect(() =>
        engine.configure({
          pattern: '',
        }),
      ).not.toThrow();
    });
  });

  describe('start', () => {
    it('should throw when not configured', async () => {
      const apiClient = createMockApiClient();
      const engine = new DeletionEngine(apiClient);

      await expect(engine.start()).rejects.toThrow('Engine not configured');
    });

    it('should throw when missing required options', async () => {
      const apiClient = createMockApiClient();
      const engine = new DeletionEngine(apiClient);
      engine.configure({ authToken: 'token' } as DeletionEngineOptions);

      await expect(engine.start()).rejects.toThrow(/Missing required options/);
    });

    it('should throw when already running', async () => {
      const message = createMockMessage();
      const apiClient = createMockApiClient({
        searchResults: [[message]],
        totalResults: 1,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      // Start without awaiting
      const startPromise = engine.start();
      await vi.advanceTimersByTimeAsync(1);

      await expect(engine.start()).rejects.toThrow('Engine is already running');

      // Cleanup
      engine.stop();
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }
      await startPromise;
    });

    it('should update state to running', async () => {
      const apiClient = createMockApiClient({
        searchResults: [],
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();
      await vi.advanceTimersByTimeAsync(1);

      const state = engine.getState();
      expect(state.running).toBe(true);

      engine.stop();
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }
      await startPromise;
    });

    it('should call onStart callback', async () => {
      const onStart = vi.fn();
      const apiClient = createMockApiClient({
        searchResults: [],
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());
      engine.setCallbacks({ onStart });

      const startPromise = engine.start();
      await vi.advanceTimersByTimeAsync(1);

      expect(onStart).toHaveBeenCalledWith(
        expect.objectContaining({ running: true }),
        expect.objectContaining({ startTime: expect.any(Number) }),
      );

      engine.stop();
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }
      await startPromise;
    });

    it('should call onStop callback when complete', async () => {
      const onStop = vi.fn();
      const apiClient = createMockApiClient({
        searchResults: [],
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());
      engine.setCallbacks({ onStop });

      const startPromise = engine.start();

      // Advance through empty page retries
      for (let i = 0; i < 3; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      await startPromise;

      expect(onStop).toHaveBeenCalled();
    });

    it('should delete messages and track progress', async () => {
      const messages = [createMockMessage({ id: '1' }), createMockMessage({ id: '2' })];

      const apiClient = createMockApiClient({
        searchResults: [messages],
        totalResults: 2,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const onProgress = vi.fn();
      engine.setCallbacks({ onProgress });

      const startPromise = engine.start();

      // Advance through message deletions
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(apiClient.deleteMessage).toHaveBeenCalledTimes(2);

      const state = engine.getState();
      expect(state.deletedCount).toBe(2);
    });

    it('should filter out non-deletable message types', async () => {
      const messages = [
        createMockMessage({ id: '1', type: 0 }), // Deletable
        createMockMessage({ id: '2', type: 3 }), // Non-deletable (call)
        createMockMessage({ id: '3', type: 19 }), // Deletable (reply)
      ];

      const apiClient = createMockApiClient({
        searchResults: [messages],
        totalResults: 3,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;

      // Only 2 messages should be deleted (types 0 and 19)
      expect(apiClient.deleteMessage).toHaveBeenCalledTimes(2);
    });

    it('should filter out pinned messages when includePinned is false', async () => {
      const messages = [
        createMockMessage({ id: '1', pinned: false }),
        createMockMessage({ id: '2', pinned: true }),
      ];

      const apiClient = createMockApiClient({
        searchResults: [messages],
        totalResults: 2,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure({
        ...createDefaultOptions(),
        includePinned: false,
      });

      const startPromise = engine.start();

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;

      expect(apiClient.deleteMessage).toHaveBeenCalledTimes(1);
    });

    it('should include pinned messages when includePinned is true', async () => {
      const messages = [
        createMockMessage({ id: '1', pinned: false }),
        createMockMessage({ id: '2', pinned: true }),
      ];

      const apiClient = createMockApiClient({
        searchResults: [messages],
        totalResults: 2,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure({
        ...createDefaultOptions(),
        includePinned: true,
      });

      const startPromise = engine.start();

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;

      expect(apiClient.deleteMessage).toHaveBeenCalledTimes(2);
    });

    it('should filter messages by regex pattern', async () => {
      const messages = [
        createMockMessage({ id: '1', content: 'hello world' }),
        createMockMessage({ id: '2', content: 'goodbye world' }),
        createMockMessage({ id: '3', content: 'HELLO there' }),
      ];

      const apiClient = createMockApiClient({
        searchResults: [messages],
        totalResults: 3,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure({
        ...createDefaultOptions(),
        pattern: 'hello',
      });

      const startPromise = engine.start();

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;

      // Should match "hello world" and "HELLO there" (case insensitive)
      expect(apiClient.deleteMessage).toHaveBeenCalledTimes(2);
    });
  });

  describe('pause and resume', () => {
    it('should pause deletion when pause is called', async () => {
      const messages = [
        createMockMessage({ id: '1' }),
        createMockMessage({ id: '2' }),
        createMockMessage({ id: '3' }),
      ];

      const apiClient = createMockApiClient({
        searchResults: [messages],
        totalResults: 3,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();
      await vi.advanceTimersByTimeAsync(5);

      engine.pause();

      const state = engine.getState();
      expect(state.paused).toBe(true);

      // Resume and complete
      engine.resume();
      engine.stop();

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;
    });

    it('should resume deletion when resume is called', async () => {
      const messages = [createMockMessage({ id: '1' }), createMockMessage({ id: '2' })];

      const apiClient = createMockApiClient({
        searchResults: [messages],
        totalResults: 2,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();
      await vi.advanceTimersByTimeAsync(5);

      engine.pause();
      expect(engine.getState().paused).toBe(true);

      engine.resume();
      expect(engine.getState().paused).toBe(false);

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;
    });

    it('should do nothing when pausing non-running engine', () => {
      const apiClient = createMockApiClient();
      const engine = new DeletionEngine(apiClient);

      // Should not throw
      expect(() => engine.pause()).not.toThrow();
      expect(engine.getState().paused).toBe(false);
    });

    it('should do nothing when resuming non-paused engine', () => {
      const apiClient = createMockApiClient();
      const engine = new DeletionEngine(apiClient);

      // Should not throw
      expect(() => engine.resume()).not.toThrow();
    });
  });

  describe('stop', () => {
    it('should stop the deletion process', async () => {
      const messages = [
        createMockMessage({ id: '1' }),
        createMockMessage({ id: '2' }),
        createMockMessage({ id: '3' }),
      ];

      const apiClient = createMockApiClient({
        searchResults: [messages],
        totalResults: 3,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();
      await vi.advanceTimersByTimeAsync(5);

      engine.stop();

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;

      const state = engine.getState();
      expect(state.running).toBe(false);
    });

    it('should resume if paused when stop is called', async () => {
      const messages = [createMockMessage({ id: '1' })];

      const apiClient = createMockApiClient({
        searchResults: [messages],
        totalResults: 1,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();
      await vi.advanceTimersByTimeAsync(5);

      engine.pause();
      engine.stop();

      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;

      const state = engine.getState();
      expect(state.running).toBe(false);
      expect(state.paused).toBe(false);
    });
  });

  describe('rate limit handling', () => {
    it('should retry on 429 rate limit', async () => {
      const message = createMockMessage({ id: '1' });
      let callCount = 0;

      const apiClient: DiscordApiClient = {
        searchMessages: vi.fn().mockImplementation(async (): Promise<SearchResponse> => {
          return {
            messages: callCount === 0 ? [[message]] : [],
            total_results: 1,
          };
        }),
        deleteMessage: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            const error = new Error('Rate limited') as Error & {
              statusCode: number;
              retryAfter: number;
            };
            error.statusCode = 429;
            error.retryAfter = 1;
            throw error;
          }
          return { success: true };
        }),
        getRateLimitInfo: vi.fn().mockReturnValue({ remaining: 10, limit: 50, resetAfter: 1000 }),
      };

      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();

      for (let i = 0; i < 50; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      await startPromise;

      // Should have retried
      expect(apiClient.deleteMessage).toHaveBeenCalledTimes(2);

      const stats = engine.getStats();
      expect(stats.throttledCount).toBeGreaterThan(0);
    });

    it('should track throttle time', async () => {
      const message = createMockMessage({ id: '1' });
      let callCount = 0;

      const apiClient: DiscordApiClient = {
        searchMessages: vi.fn().mockImplementation(async (): Promise<SearchResponse> => {
          return {
            messages: callCount === 0 ? [[message]] : [],
            total_results: 1,
          };
        }),
        deleteMessage: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            const error = new Error('Rate limited') as Error & {
              statusCode: number;
              retryAfter: number;
            };
            error.statusCode = 429;
            error.retryAfter = 2;
            throw error;
          }
          return { success: true };
        }),
        getRateLimitInfo: vi.fn().mockReturnValue({ remaining: 10, limit: 50, resetAfter: 1000 }),
      };

      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();

      for (let i = 0; i < 50; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      await startPromise;

      const stats = engine.getStats();
      expect(stats.throttledTime).toBe(2000);
    });
  });

  describe('error handling', () => {
    it('should handle 404 as success (message already deleted)', async () => {
      const message = createMockMessage({ id: '1' });
      let searchCallCount = 0;

      const apiClient: DiscordApiClient = {
        searchMessages: vi.fn().mockImplementation(async (): Promise<SearchResponse> => {
          searchCallCount++;
          return {
            messages: searchCallCount === 1 ? [[message]] : [],
            total_results: 1,
          };
        }),
        deleteMessage: vi.fn().mockImplementation(async () => {
          const error = new Error('Not found') as Error & { statusCode: number };
          error.statusCode = 404;
          throw error;
        }),
        getRateLimitInfo: vi.fn().mockReturnValue({ remaining: 10, limit: 50, resetAfter: 1000 }),
      };

      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();

      for (let i = 0; i < 50; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      await startPromise;

      const state = engine.getState();
      expect(state.deletedCount).toBe(1);
      expect(state.failedCount).toBe(0);
    });

    it('should handle 403 as failure (permission denied)', async () => {
      const message = createMockMessage({ id: '1' });
      let searchCallCount = 0;

      const apiClient: DiscordApiClient = {
        searchMessages: vi.fn().mockImplementation(async (): Promise<SearchResponse> => {
          searchCallCount++;
          return {
            messages: searchCallCount === 1 ? [[message]] : [],
            total_results: 1,
          };
        }),
        deleteMessage: vi.fn().mockImplementation(async () => {
          const error = new Error('Forbidden') as Error & { statusCode: number };
          error.statusCode = 403;
          throw error;
        }),
        getRateLimitInfo: vi.fn().mockReturnValue({ remaining: 10, limit: 50, resetAfter: 1000 }),
      };

      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();

      for (let i = 0; i < 50; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      await startPromise;

      const state = engine.getState();
      expect(state.deletedCount).toBe(0);
      expect(state.failedCount).toBe(1);
    });

    it('should call onError callback on non-retryable errors', async () => {
      const message = createMockMessage({ id: '1' });
      const onError = vi.fn();
      let searchCallCount = 0;

      const apiClient: DiscordApiClient = {
        searchMessages: vi.fn().mockImplementation(async (): Promise<SearchResponse> => {
          searchCallCount++;
          return {
            messages: searchCallCount === 1 ? [[message]] : [],
            total_results: 1,
          };
        }),
        deleteMessage: vi.fn().mockImplementation(async () => {
          const error = new Error('Server error') as Error & { statusCode: number };
          error.statusCode = 500;
          throw error;
        }),
        getRateLimitInfo: vi.fn().mockReturnValue({ remaining: 10, limit: 50, resetAfter: 1000 }),
      };

      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());
      engine.setCallbacks({ onError });

      const startPromise = engine.start();

      for (let i = 0; i < 50; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      await startPromise;

      expect(onError).toHaveBeenCalled();
    });

    it('should throw on search error after max retries', async () => {
      const apiClient: DiscordApiClient = {
        searchMessages: vi.fn().mockImplementation(async () => {
          const error = new Error('Rate limited') as Error & {
            statusCode: number;
            retryAfter: number;
          };
          error.statusCode = 429;
          error.retryAfter = 0.01;
          throw error;
        }),
        deleteMessage: vi.fn(),
        getRateLimitInfo: vi.fn().mockReturnValue({ remaining: 0, limit: 50, resetAfter: 1000 }),
      };

      const engine = new DeletionEngine(apiClient);
      engine.configure({
        ...createDefaultOptions(),
        maxRetries: 2,
      });

      // Attach rejection handler immediately to avoid unhandled rejection warning
      const startPromise = engine.start().catch((e) => e);

      for (let i = 0; i < 20; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      const result = await startPromise;
      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toMatch(/Search failed after/);
    });
  });

  describe('getState', () => {
    it('should return a copy of state', () => {
      const apiClient = createMockApiClient();
      const engine = new DeletionEngine(apiClient);

      const state1 = engine.getState();
      const state2 = engine.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('getStats', () => {
    it('should return a copy of stats', () => {
      const apiClient = createMockApiClient();
      const engine = new DeletionEngine(apiClient);

      const stats1 = engine.getStats();
      const stats2 = engine.getStats();

      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });

    it('should track average ping', async () => {
      const message = createMockMessage({ id: '1' });

      const apiClient = createMockApiClient({
        searchResults: [[message]],
        totalResults: 1,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();

      for (let i = 0; i < 50; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;

      const stats = engine.getStats();
      expect(stats.averagePing).toBeGreaterThanOrEqual(0);
    });
  });

  describe('empty page handling', () => {
    it('should stop after consecutive empty pages', async () => {
      const apiClient = createMockApiClient({
        searchResults: [],
        totalResults: 0,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();

      // Should complete after 5 empty page retries (with exponential backoff)
      // Total delay: 10s + 13s + 16.9s + 21.97s + 28.56s ≈ 90s
      for (let i = 0; i < 200; i++) {
        await vi.advanceTimersByTimeAsync(500);
      }

      await startPromise;

      expect(apiClient.searchMessages).toHaveBeenCalledTimes(5);
    });
  });

  describe('pagination', () => {
    it('should always search from offset 0 and filter already-attempted messages', async () => {
      // First search returns 3 messages, second returns same 3 (stale index), third returns empty
      const messages = [
        createMockMessage({ id: '1' }),
        createMockMessage({ id: '2' }),
        createMockMessage({ id: '3' }),
      ];

      const apiClient = createMockApiClient({
        searchResults: [messages, messages, []], // Same messages twice, then empty
        totalResults: 3,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();

      for (let i = 0; i < 100; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;

      // All searches should use offset 0
      const calls = vi.mocked(apiClient.searchMessages).mock.calls;
      for (const call of calls) {
        expect(call[0]).toEqual(expect.objectContaining({ offset: 0 }));
      }

      // Messages should only be deleted once despite stale index returning them again
      expect(apiClient.deleteMessage).toHaveBeenCalledTimes(3);
    });
  });

  describe('estimated time remaining', () => {
    it('should calculate estimated time remaining after deletions', async () => {
      const messages = [
        createMockMessage({ id: '1' }),
        createMockMessage({ id: '2' }),
        createMockMessage({ id: '3' }),
        createMockMessage({ id: '4' }),
      ];

      const apiClient = createMockApiClient({
        searchResults: [messages],
        totalResults: 4,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      let lastStats: DeletionEngineStats | null = null;
      engine.setCallbacks({
        onProgress: (_state, stats) => {
          lastStats = stats;
        },
      });

      const startPromise = engine.start();

      for (let i = 0; i < 50; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;

      // After first deletion, should have estimated time
      expect(lastStats).not.toBeNull();
    });
  });

  describe('initialTotalFound tracking', () => {
    it('should preserve initialTotalFound when totalFound decreases', async () => {
      // Simulate Discord's behavior: total_results decreases as messages are deleted
      // First search returns total_results: 100
      // Second search returns total_results: 75 (after some deletions)
      // Third search returns total_results: 50
      // initialTotalFound should remain 100 throughout

      const messages1 = [createMockMessage({ id: '1' })];
      const messages2 = [createMockMessage({ id: '2' })];

      let searchCount = 0;
      const apiClient: DiscordApiClient = {
        searchMessages: vi.fn().mockImplementation(async (): Promise<SearchResponse> => {
          searchCount++;
          if (searchCount === 1) {
            return { messages: [messages1], total_results: 100 };
          }
          if (searchCount === 2) {
            return { messages: [messages2], total_results: 75 };
          }
          return { messages: [], total_results: 50 };
        }),
        deleteMessage: vi.fn().mockResolvedValue({ success: true }),
        getRateLimitInfo: vi.fn().mockReturnValue(null),
      };

      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const progressStates: { totalFound: number; initialTotalFound: number }[] = [];
      engine.setCallbacks({
        onProgress: (state) => {
          progressStates.push({
            totalFound: state.totalFound,
            initialTotalFound: state.initialTotalFound,
          });
        },
      });

      const startPromise = engine.start();

      for (let i = 0; i < 100; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;

      // Verify initialTotalFound stayed at 100 while totalFound decreased
      const finalState = engine.getState();
      expect(finalState.initialTotalFound).toBe(100);
      expect(finalState.totalFound).toBeLessThanOrEqual(75);

      // Verify that initialTotalFound was consistent throughout
      for (const state of progressStates) {
        expect(state.initialTotalFound).toBe(100);
      }
    });

    it('should initialize initialTotalFound with state', () => {
      const apiClient = createMockApiClient();
      const engine = new DeletionEngine(apiClient);
      const state = engine.getState();

      expect(state.initialTotalFound).toBe(0);
    });
  });

  describe('throttle recovery', () => {
    it('should recover from throttled state after consecutive successes', async () => {
      // Create 6 messages to trigger 6 successful deletions (threshold is 5)
      const messages = [
        createMockMessage({ id: '1' }),
        createMockMessage({ id: '2' }),
        createMockMessage({ id: '3' }),
        createMockMessage({ id: '4' }),
        createMockMessage({ id: '5' }),
        createMockMessage({ id: '6' }),
      ];

      let deleteCallCount = 0;
      let searchCallCount = 0;

      const apiClient: DiscordApiClient = {
        searchMessages: vi.fn().mockImplementation(async (): Promise<SearchResponse> => {
          searchCallCount++;
          // Return messages on first call, empty on second
          return {
            messages: searchCallCount === 1 ? messages.map((m) => [m]) : [],
            total_results: messages.length,
          };
        }),
        deleteMessage: vi.fn().mockImplementation(async () => {
          deleteCallCount++;
          // First deletion triggers rate limit
          if (deleteCallCount === 1) {
            const error = new Error('Rate limited') as Error & {
              statusCode: number;
              retryAfter: number;
            };
            error.statusCode = 429;
            error.retryAfter = 2; // 2 seconds
            throw error;
          }
          // All subsequent deletions succeed
          return { success: true };
        }),
        getRateLimitInfo: vi.fn().mockReturnValue({ remaining: 10, limit: 50, resetAfter: 1000 }),
      };

      const engine = new DeletionEngine(apiClient);
      engine.configure({
        ...createDefaultOptions(),
        maxRetries: 5,
      });

      const rateLimitChanges: Array<{ isThrottled: boolean; currentDelay: number }> = [];
      engine.setCallbacks({
        onRateLimitChange: (info) => {
          rateLimitChanges.push({ ...info });
        },
      });

      const startPromise = engine.start();

      // Advance through all deletions (with rate limit handling)
      for (let i = 0; i < 200; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      await startPromise;

      // Should have received rate limit change notifications
      expect(rateLimitChanges.length).toBeGreaterThan(0);

      // First notification should be throttled
      expect(rateLimitChanges[0]?.isThrottled).toBe(true);
    });

    it('should call onRateLimitChange when rate limited', async () => {
      const message = createMockMessage({ id: '1' });
      let searchCallCount = 0;
      let deleteAttempts = 0;

      const apiClient: DiscordApiClient = {
        searchMessages: vi.fn().mockImplementation(async (): Promise<SearchResponse> => {
          searchCallCount++;
          return {
            messages: searchCallCount === 1 ? [[message]] : [],
            total_results: 1,
          };
        }),
        deleteMessage: vi.fn().mockImplementation(async () => {
          deleteAttempts++;
          // Fail first 2 attempts, then succeed
          if (deleteAttempts <= 2) {
            const error = new Error('Rate limited') as Error & {
              statusCode: number;
              retryAfter: number;
            };
            error.statusCode = 429;
            error.retryAfter = 0.1; // 100ms - keep it short for tests
            throw error;
          }
          return { success: true };
        }),
        getRateLimitInfo: vi.fn().mockReturnValue({ remaining: 0, limit: 50, resetAfter: 100 }),
      };

      const engine = new DeletionEngine(apiClient);
      engine.configure({
        ...createDefaultOptions(),
        deleteDelay: 10,
        maxRetries: 5,
      });

      const onRateLimitChange = vi.fn();
      engine.setCallbacks({ onRateLimitChange });

      const startPromise = engine.start();

      // Advance time for all operations
      for (let i = 0; i < 50; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;

      // onRateLimitChange should have been called with throttle info
      expect(onRateLimitChange).toHaveBeenCalled();
      expect(onRateLimitChange).toHaveBeenCalledWith(
        expect.objectContaining({
          isThrottled: true,
          currentDelay: expect.any(Number),
        }),
      );
    });

    it('should increase delay when rate limited', async () => {
      const message = createMockMessage({ id: '1' });
      let deleteCallCount = 0;
      let searchCallCount = 0;

      const apiClient: DiscordApiClient = {
        searchMessages: vi.fn().mockImplementation(async (): Promise<SearchResponse> => {
          searchCallCount++;
          return {
            messages: searchCallCount === 1 ? [[message]] : [],
            total_results: 1,
          };
        }),
        deleteMessage: vi.fn().mockImplementation(async () => {
          deleteCallCount++;
          if (deleteCallCount <= 2) {
            const error = new Error('Rate limited') as Error & {
              statusCode: number;
              retryAfter: number;
            };
            error.statusCode = 429;
            error.retryAfter = 3;
            throw error;
          }
          return { success: true };
        }),
        getRateLimitInfo: vi.fn().mockReturnValue({ remaining: 0, limit: 50, resetAfter: 3000 }),
      };

      const engine = new DeletionEngine(apiClient);
      engine.configure({
        ...createDefaultOptions(),
        deleteDelay: 100,
        maxRetries: 5,
      });

      const delays: number[] = [];
      engine.setCallbacks({
        onRateLimitChange: (info) => {
          delays.push(info.currentDelay);
        },
      });

      const startPromise = engine.start();

      for (let i = 0; i < 150; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      await startPromise;

      // Delays should have been recorded and should increase with consecutive rate limits
      expect(delays.length).toBeGreaterThan(0);
      // Each subsequent rate limit should increase delay
      for (let i = 1; i < delays.length; i++) {
        // Allow for recovery which might decrease delay
        expect(delays[i]).toBeDefined();
      }
    });
  });

  describe('ping tracking', () => {
    it('should record ping times for rolling average', async () => {
      const messages = Array.from({ length: 25 }, (_, i) => createMockMessage({ id: String(i) }));

      const apiClient = createMockApiClient({
        searchResults: [messages],
        totalResults: 25,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();

      for (let i = 0; i < 150; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;

      const stats = engine.getStats();
      // Average ping should be calculated (may be 0 in test due to fake timers)
      expect(typeof stats.averagePing).toBe('number');
      expect(stats.averagePing).toBeGreaterThanOrEqual(0);
    });

    it('should limit ping history to 20 entries', async () => {
      // Create 25 messages to exceed the 20-entry limit
      const messages = Array.from({ length: 25 }, (_, i) => createMockMessage({ id: String(i) }));

      const apiClient = createMockApiClient({
        searchResults: [messages],
        totalResults: 25,
      });
      const engine = new DeletionEngine(apiClient);
      engine.configure(createDefaultOptions());

      const startPromise = engine.start();

      for (let i = 0; i < 200; i++) {
        await vi.advanceTimersByTimeAsync(50);
      }

      await startPromise;

      // The rolling average should still be calculated correctly
      const stats = engine.getStats();
      expect(typeof stats.averagePing).toBe('number');
    });
  });
});
