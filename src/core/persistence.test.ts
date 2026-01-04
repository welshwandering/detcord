/**
 * Tests for persistence module
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProgress,
  getDeletionsUntilSave,
  hasExistingSession,
  loadProgress,
  type SavedProgress,
  saveProgress,
  shouldSaveProgress,
} from './persistence';

describe('persistence', () => {
  // Mock localStorage
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
      get length() {
        return Object.keys(store).length;
      },
      key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    };
  })();

  beforeEach(() => {
    // Reset localStorage mock before each test
    localStorageMock.clear();
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Valid snowflakes must be 17-19 digits
  const VALID_AUTHOR_ID = '12345678901234567';
  const VALID_MESSAGE_ID = '98765432109876543';
  const VALID_GUILD_ID = '11111111111111111';
  const VALID_CHANNEL_ID = '22222222222222222';

  describe('saveProgress / loadProgress round-trip', () => {
    it('should save and load progress correctly', () => {
      const progress: SavedProgress = {
        authorId: VALID_AUTHOR_ID,
        lastMaxId: VALID_MESSAGE_ID,
        deletedCount: 50,
        totalFound: 100,
        timestamp: Date.now(),
      };

      saveProgress(progress);
      const loaded = loadProgress();

      expect(loaded).toEqual(progress);
    });

    it('should save and load progress with guildId and channelId', () => {
      const progress: SavedProgress = {
        guildId: VALID_GUILD_ID,
        channelId: VALID_CHANNEL_ID,
        authorId: VALID_AUTHOR_ID,
        lastMaxId: VALID_MESSAGE_ID,
        deletedCount: 25,
        totalFound: 50,
        timestamp: Date.now(),
      };

      saveProgress(progress);
      const loaded = loadProgress();

      expect(loaded).toEqual(progress);
    });

    it('should save and load progress with filters', () => {
      const progress: SavedProgress = {
        authorId: VALID_AUTHOR_ID,
        lastMaxId: VALID_MESSAGE_ID,
        deletedCount: 10,
        totalFound: 20,
        timestamp: Date.now(),
        filters: {
          content: 'test',
          hasLink: true,
          hasFile: false,
          includePinned: true,
          pattern: 'foo.*bar',
          minId: '00000000000000001',
        },
      };

      saveProgress(progress);
      const loaded = loadProgress();

      expect(loaded).toEqual(progress);
      expect(loaded?.filters).toEqual(progress.filters);
    });
  });

  describe('clearProgress', () => {
    it('should remove saved progress from localStorage', () => {
      const progress: SavedProgress = {
        authorId: VALID_AUTHOR_ID,
        lastMaxId: VALID_MESSAGE_ID,
        deletedCount: 10,
        totalFound: 20,
        timestamp: Date.now(),
      };

      saveProgress(progress);
      expect(loadProgress()).not.toBeNull();

      clearProgress();
      expect(loadProgress()).toBeNull();
    });

    it('should not throw when localStorage is empty', () => {
      expect(() => clearProgress()).not.toThrow();
    });
  });

  describe('hasExistingSession', () => {
    it('should return true when valid session exists', () => {
      const progress: SavedProgress = {
        authorId: VALID_AUTHOR_ID,
        lastMaxId: VALID_MESSAGE_ID,
        deletedCount: 10,
        totalFound: 20,
        timestamp: Date.now(),
      };

      saveProgress(progress);
      expect(hasExistingSession()).toBe(true);
    });

    it('should return false when no session exists', () => {
      expect(hasExistingSession()).toBe(false);
    });

    it('should return false when session is expired', () => {
      const progress: SavedProgress = {
        authorId: VALID_AUTHOR_ID,
        lastMaxId: VALID_MESSAGE_ID,
        deletedCount: 10,
        totalFound: 20,
        // 25 hours ago (expired)
        timestamp: Date.now() - 25 * 60 * 60 * 1000,
      };

      saveProgress(progress);
      expect(hasExistingSession()).toBe(false);
    });
  });

  describe('24h expiry handling', () => {
    it('should return null for expired progress', () => {
      const progress: SavedProgress = {
        authorId: VALID_AUTHOR_ID,
        lastMaxId: VALID_MESSAGE_ID,
        deletedCount: 10,
        totalFound: 20,
        // 25 hours ago (expired)
        timestamp: Date.now() - 25 * 60 * 60 * 1000,
      };

      saveProgress(progress);
      const loaded = loadProgress();

      expect(loaded).toBeNull();
    });

    it('should return progress just before expiry', () => {
      const progress: SavedProgress = {
        authorId: VALID_AUTHOR_ID,
        lastMaxId: VALID_MESSAGE_ID,
        deletedCount: 10,
        totalFound: 20,
        // 23 hours ago (not expired)
        timestamp: Date.now() - 23 * 60 * 60 * 1000,
      };

      saveProgress(progress);
      const loaded = loadProgress();

      expect(loaded).not.toBeNull();
      expect(loaded?.authorId).toBe(progress.authorId);
    });

    it('should clear expired progress from localStorage', () => {
      const progress: SavedProgress = {
        authorId: VALID_AUTHOR_ID,
        lastMaxId: VALID_MESSAGE_ID,
        deletedCount: 10,
        totalFound: 20,
        // 25 hours ago (expired)
        timestamp: Date.now() - 25 * 60 * 60 * 1000,
      };

      saveProgress(progress);
      loadProgress(); // Should clear expired progress

      // Verify removeItem was called
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('detcord_progress');
    });
  });

  describe('localStorage error handling', () => {
    it('should handle localStorage.setItem throwing QuotaExceededError', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      });

      const progress: SavedProgress = {
        authorId: VALID_AUTHOR_ID,
        lastMaxId: VALID_MESSAGE_ID,
        deletedCount: 10,
        totalFound: 20,
        timestamp: Date.now(),
      };

      // Should not throw
      expect(() => saveProgress(progress)).not.toThrow();
    });

    it('should handle localStorage.getItem throwing', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage access denied');
      });

      // Should not throw, should return null
      expect(() => loadProgress()).not.toThrow();
      expect(loadProgress()).toBeNull();
    });

    it('should handle localStorage.removeItem throwing', () => {
      localStorageMock.removeItem.mockImplementation(() => {
        throw new Error('localStorage access denied');
      });

      // Should not throw
      expect(() => clearProgress()).not.toThrow();
    });

    it('should handle invalid JSON in localStorage', () => {
      localStorageMock.getItem.mockReturnValue('not valid json');

      // Should not throw, should return null
      expect(() => loadProgress()).not.toThrow();
      expect(loadProgress()).toBeNull();
    });

    it('should return null for incomplete saved data', () => {
      // Missing required fields
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          deletedCount: 10,
          totalFound: 20,
          timestamp: Date.now(),
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when timestamp is not a number', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: '123',
          lastMaxId: '456',
          deletedCount: 10,
          totalFound: 20,
          timestamp: 'not a number',
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when guildId is not a string', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          guildId: 12345, // Should be string
          deletedCount: 10,
          totalFound: 20,
          timestamp: Date.now(),
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when guildId is invalid snowflake', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          guildId: 'invalid',
          deletedCount: 10,
          totalFound: 20,
          timestamp: Date.now(),
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should accept @me as valid guildId for DMs', () => {
      const progress = {
        authorId: VALID_AUTHOR_ID,
        lastMaxId: VALID_MESSAGE_ID,
        guildId: '@me',
        deletedCount: 10,
        totalFound: 20,
        timestamp: Date.now(),
      };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(progress));

      const loaded = loadProgress();
      expect(loaded).not.toBeNull();
      expect(loaded?.guildId).toBe('@me');
    });

    it('should return null when channelId is not a string', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          channelId: 12345, // Should be string
          deletedCount: 10,
          totalFound: 20,
          timestamp: Date.now(),
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when channelId is invalid snowflake', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          channelId: 'invalid',
          deletedCount: 10,
          totalFound: 20,
          timestamp: Date.now(),
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when initialTotalFound is not a number', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          deletedCount: 10,
          totalFound: 20,
          initialTotalFound: 'not a number',
          timestamp: Date.now(),
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when filters is not an object', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          deletedCount: 10,
          totalFound: 20,
          timestamp: Date.now(),
          filters: 'not an object',
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when filters.content is not a string', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          deletedCount: 10,
          totalFound: 20,
          timestamp: Date.now(),
          filters: { content: 123 },
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when filters.hasLink is not a boolean', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          deletedCount: 10,
          totalFound: 20,
          timestamp: Date.now(),
          filters: { hasLink: 'yes' },
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when filters.hasFile is not a boolean', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          deletedCount: 10,
          totalFound: 20,
          timestamp: Date.now(),
          filters: { hasFile: 1 },
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when filters.includePinned is not a boolean', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          deletedCount: 10,
          totalFound: 20,
          timestamp: Date.now(),
          filters: { includePinned: 'true' },
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when filters.pattern is not a string', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          deletedCount: 10,
          totalFound: 20,
          timestamp: Date.now(),
          filters: { pattern: /regex/ },
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when filters.minId is not a valid snowflake', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          deletedCount: 10,
          totalFound: 20,
          timestamp: Date.now(),
          filters: { minId: 'invalid' },
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when filters is null', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          deletedCount: 10,
          totalFound: 20,
          timestamp: Date.now(),
          filters: null,
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when deletedCount is not finite', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          deletedCount: Number.POSITIVE_INFINITY,
          totalFound: 20,
          timestamp: Date.now(),
        }),
      );

      expect(loadProgress()).toBeNull();
    });

    it('should return null when totalFound is not finite', () => {
      localStorageMock.getItem.mockReturnValue(
        JSON.stringify({
          authorId: VALID_AUTHOR_ID,
          lastMaxId: VALID_MESSAGE_ID,
          deletedCount: 10,
          totalFound: Number.NaN,
          timestamp: Date.now(),
        }),
      );

      expect(loadProgress()).toBeNull();
    });
  });

  describe('getDeletionsUntilSave', () => {
    it('should return 10 when deletedCount is 0', () => {
      expect(getDeletionsUntilSave(0)).toBe(10);
    });

    it('should return 9 when deletedCount is 1', () => {
      expect(getDeletionsUntilSave(1)).toBe(9);
    });

    it('should return 1 when deletedCount is 9', () => {
      expect(getDeletionsUntilSave(9)).toBe(1);
    });

    it('should return 10 when deletedCount is 10', () => {
      expect(getDeletionsUntilSave(10)).toBe(10);
    });

    it('should return 5 when deletedCount is 15', () => {
      expect(getDeletionsUntilSave(15)).toBe(5);
    });
  });

  describe('shouldSaveProgress', () => {
    it('should return false when deletedCount is 0', () => {
      expect(shouldSaveProgress(0)).toBe(false);
    });

    it('should return false when deletedCount is 1', () => {
      expect(shouldSaveProgress(1)).toBe(false);
    });

    it('should return true when deletedCount is 10', () => {
      expect(shouldSaveProgress(10)).toBe(true);
    });

    it('should return true when deletedCount is 20', () => {
      expect(shouldSaveProgress(20)).toBe(true);
    });

    it('should return false when deletedCount is 15', () => {
      expect(shouldSaveProgress(15)).toBe(false);
    });

    it('should return true when deletedCount is 100', () => {
      expect(shouldSaveProgress(100)).toBe(true);
    });
  });
});
