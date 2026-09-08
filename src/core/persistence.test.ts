/**
 * Tests for the v2 session persistence layer.
 *
 * Every test drives persistence through a mocked `getPageStorage()` backed by
 * an in-memory `Storage`, because Discord deletes `window.localStorage` and the
 * real module must never touch it directly.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  clearProgress,
  findResumableSession,
  getDeletionsUntilSave,
  isValidProgressData,
  loadProgress,
  type SavedProgress,
  saveProgress,
  shouldSaveProgress,
  targetKeyFor,
} from './persistence';

// =============================================================================
// Helpers
// =============================================================================

/** Minimal in-memory Storage implementation with the indexed key API. */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length(): number {
      return map.size;
    },
    clear(): void {
      map.clear();
    },
    getItem(key: string): string | null {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    key(index: number): string | null {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      map.delete(key);
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
  } as Storage;
}

/** Overrides for {@link createProgress}; optional fields may be cleared. */
type ProgressOverrides = Partial<Omit<SavedProgress, 'guildId' | 'channelId'>> & {
  guildId?: string | undefined;
  channelId?: string | undefined;
};

function createProgress(overrides: ProgressOverrides = {}): SavedProgress {
  const merged: Record<string, unknown> = {
    version: 2,
    runId: 'run-1',
    authorId: '111111111111111111',
    guildId: '222222222222222222',
    deletionOrder: 'newest',
    cursor: { maxId: '333333333333333333' },
    deletedCount: 10,
    failedCount: 1,
    skippedCount: 2,
    alreadyGoneCount: 3,
    totalFound: 100,
    initialTotalFound: 120,
    timestamp: Date.now(),
    ...overrides,
  };
  for (const key of Object.keys(merged)) {
    if (merged[key] === undefined) {
      delete merged[key];
    }
  }
  return merged as unknown as SavedProgress;
}

const AUTHOR = '111111111111111111';
const GUILD_KEY = 'g:222222222222222222';

// =============================================================================
// Tests
// =============================================================================

describe('persistence', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createMemoryStorage();
    storageState.current = storage;
  });

  describe('targetKeyFor', () => {
    it('prefers the guild over the channel', () => {
      expect(targetKeyFor({ guildId: 'g1', channelId: 'c1' })).toBe('g:g1');
    });

    it('falls back to the channel', () => {
      expect(targetKeyFor({ channelId: 'c1' })).toBe('c:c1');
    });

    it('returns a stable key when neither is set', () => {
      expect(targetKeyFor({})).toBe('all');
    });
  });

  describe('saveProgress / loadProgress', () => {
    it('round-trips a v2 entry under the per-target key', () => {
      const progress = createProgress();
      saveProgress(progress);

      expect(storage.getItem(`detcord_progress:v2:${AUTHOR}:${GUILD_KEY}`)).not.toBeNull();
      expect(loadProgress(AUTHOR, GUILD_KEY)).toEqual(progress);
    });

    it('keeps runs in different targets apart', () => {
      saveProgress(createProgress());
      saveProgress(
        createProgress({
          runId: 'run-2',
          guildId: undefined,
          channelId: '444444444444444444',
          deletedCount: 99,
        }),
      );

      expect(loadProgress(AUTHOR, GUILD_KEY)?.deletedCount).toBe(10);
      expect(loadProgress(AUTHOR, 'c:444444444444444444')?.deletedCount).toBe(99);
    });

    it('returns null when nothing is stored', () => {
      expect(loadProgress(AUTHOR, GUILD_KEY)).toBeNull();
    });

    it('returns null and does not throw when no storage is available', () => {
      storageState.current = null;
      expect(() => saveProgress(createProgress())).not.toThrow();
      expect(loadProgress(AUTHOR, GUILD_KEY)).toBeNull();
      expect(findResumableSession(AUTHOR)).toBeNull();
      expect(() => clearProgress(AUTHOR, GUILD_KEY)).not.toThrow();
    });

    it('swallows storage write failures', () => {
      storageState.current = {
        ...storage,
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceeded');
        },
      } as unknown as Storage;

      expect(() => saveProgress(createProgress())).not.toThrow();
    });

    it('removes an entry with invalid JSON', () => {
      const key = `detcord_progress:v2:${AUTHOR}:${GUILD_KEY}`;
      storage.setItem(key, '{not json');

      expect(loadProgress(AUTHOR, GUILD_KEY)).toBeNull();
      expect(storage.getItem(key)).toBeNull();
    });

    it('removes an entry that fails schema validation', () => {
      const key = `detcord_progress:v2:${AUTHOR}:${GUILD_KEY}`;
      storage.setItem(key, JSON.stringify({ version: 2, authorId: AUTHOR }));

      expect(loadProgress(AUTHOR, GUILD_KEY)).toBeNull();
      expect(storage.getItem(key)).toBeNull();
    });

    it('removes an entry older than 24 hours', () => {
      const key = `detcord_progress:v2:${AUTHOR}:${GUILD_KEY}`;
      saveProgress(createProgress({ timestamp: Date.now() - 25 * 60 * 60 * 1000 }));

      expect(loadProgress(AUTHOR, GUILD_KEY)).toBeNull();
      expect(storage.getItem(key)).toBeNull();
    });

    it('keeps an entry just inside the expiry window', () => {
      saveProgress(createProgress({ timestamp: Date.now() - 23 * 60 * 60 * 1000 }));
      expect(loadProgress(AUTHOR, GUILD_KEY)).not.toBeNull();
    });

    it('returns null when the storage read throws', () => {
      storageState.current = {
        ...storage,
        getItem: () => {
          throw new Error('blocked');
        },
      } as unknown as Storage;

      expect(loadProgress(AUTHOR, GUILD_KEY)).toBeNull();
    });
  });

  describe('legacy v1 entries', () => {
    it('removes the legacy key on save', () => {
      storage.setItem('detcord_progress', JSON.stringify({ lastMaxId: '1', deletedCount: 3 }));
      saveProgress(createProgress());
      expect(storage.getItem('detcord_progress')).toBeNull();
    });

    it('removes the legacy key on load', () => {
      storage.setItem('detcord_progress', '{}');
      loadProgress(AUTHOR, GUILD_KEY);
      expect(storage.getItem('detcord_progress')).toBeNull();
    });

    it('removes the legacy key when scanning for resumable sessions', () => {
      storage.setItem('detcord_progress', '{}');
      findResumableSession(AUTHOR);
      expect(storage.getItem('detcord_progress')).toBeNull();
    });

    it('never resumes from a v1 payload', () => {
      storage.setItem(
        `detcord_progress:v2:${AUTHOR}:${GUILD_KEY}`,
        JSON.stringify({
          authorId: AUTHOR,
          lastMaxId: '1',
          deletedCount: 3,
          timestamp: Date.now(),
        }),
      );
      expect(loadProgress(AUTHOR, GUILD_KEY)).toBeNull();
    });
  });

  describe('findResumableSession', () => {
    it('returns the newest non-expired entry for the author', () => {
      saveProgress(createProgress({ runId: 'old', timestamp: Date.now() - 60_000 }));
      saveProgress(
        createProgress({
          runId: 'new',
          guildId: undefined,
          channelId: '444444444444444444',
          timestamp: Date.now(),
        }),
      );

      expect(findResumableSession(AUTHOR)?.runId).toBe('new');
    });

    it('ignores entries belonging to another author', () => {
      saveProgress(createProgress({ authorId: '999999999999999999' }));
      expect(findResumableSession(AUTHOR)).toBeNull();
    });

    it('skips and removes expired entries while scanning', () => {
      saveProgress(createProgress({ timestamp: Date.now() - 48 * 60 * 60 * 1000 }));
      expect(findResumableSession(AUTHOR)).toBeNull();
      expect(storage.getItem(`detcord_progress:v2:${AUTHOR}:${GUILD_KEY}`)).toBeNull();
    });

    it('returns null when key enumeration throws', () => {
      saveProgress(createProgress());
      const broken = {
        ...storage,
        getItem: (key: string) => storage.getItem(key),
        removeItem: (key: string) => storage.removeItem(key),
        key: () => {
          throw new Error('blocked');
        },
        get length(): number {
          return 1;
        },
      } as unknown as Storage;
      storageState.current = broken;

      expect(findResumableSession(AUTHOR)).toBeNull();
    });
  });

  describe('clearProgress', () => {
    it('removes only the targeted entry', () => {
      saveProgress(createProgress());
      saveProgress(
        createProgress({ guildId: undefined, channelId: '444444444444444444', runId: 'keep' }),
      );

      clearProgress(AUTHOR, GUILD_KEY);

      expect(loadProgress(AUTHOR, GUILD_KEY)).toBeNull();
      expect(loadProgress(AUTHOR, 'c:444444444444444444')?.runId).toBe('keep');
    });

    it('swallows removal failures', () => {
      storageState.current = {
        ...storage,
        getItem: () => null,
        removeItem: () => {
          throw new Error('blocked');
        },
      } as unknown as Storage;

      expect(() => clearProgress(AUTHOR, GUILD_KEY)).not.toThrow();
    });

    it('removes the entry when the run ID matches', () => {
      saveProgress(createProgress({ runId: 'run-a' }));

      clearProgress(AUTHOR, GUILD_KEY, 'run-a');

      expect(loadProgress(AUTHOR, GUILD_KEY)).toBeNull();
    });

    it('keeps a checkpoint written by another run', () => {
      // Two tabs share one key; the run that finishes first must not erase the
      // checkpoint the other one is still relying on.
      saveProgress(createProgress({ runId: 'other-tab' }));

      clearProgress(AUTHOR, GUILD_KEY, 'this-tab');

      expect(loadProgress(AUTHOR, GUILD_KEY)?.runId).toBe('other-tab');
    });
  });

  describe('isValidProgressData', () => {
    it('accepts a complete v2 entry', () => {
      expect(isValidProgressData(createProgress())).toBe(true);
    });

    it.each([
      ['null', null],
      ['a string', 'nope'],
      ['a v1 entry', { version: 1, authorId: AUTHOR }],
      ['a missing runId', { ...createProgress(), runId: '' }],
      ['a missing authorId', { ...createProgress(), authorId: '' }],
      ['a bad deletion order', { ...createProgress(), deletionOrder: 'sideways' }],
      ['a non-string guildId', { ...createProgress(), guildId: 5 }],
      ['a non-string channelId', { ...createProgress(), channelId: 5 }],
      ['a missing cursor', { ...createProgress(), cursor: undefined }],
      ['a non-string cursor maxId', { ...createProgress(), cursor: { maxId: 5 } }],
      ['a non-string cursor minId', { ...createProgress(), cursor: { minId: 5 } }],
      ['a non-numeric counter', { ...createProgress(), alreadyGoneCount: 'three' }],
      ['a non-finite timestamp', { ...createProgress(), timestamp: Number.NaN }],
      ['a non-object filters', { ...createProgress(), filters: 'nope' }],
      ['a non-string filter value', { ...createProgress(), filters: { pattern: 5 } }],
      ['a non-boolean filter value', { ...createProgress(), filters: { hasLink: 'yes' } }],
    ])('rejects %s', (_label, value) => {
      expect(isValidProgressData(value)).toBe(false);
    });

    it('accepts an entry with valid filters', () => {
      const progress = createProgress({
        filters: {
          content: 'hi',
          hasLink: true,
          hasFile: false,
          includePinned: true,
          pattern: 'a.*b',
          minId: '555555555555555555',
          maxId: '666666666666666666',
        },
      });
      expect(isValidProgressData(progress)).toBe(true);
    });

    it.each([
      ['a non-snowflake authorId', { ...createProgress(), authorId: 'nope' }],
      ['a non-snowflake channelId', { ...createProgress(), channelId: '42' }],
      ['a non-snowflake guildId', { ...createProgress(), guildId: 'guild' }],
      ['a non-snowflake cursor maxId', { ...createProgress(), cursor: { maxId: '1' } }],
      ['a non-snowflake cursor minId', { ...createProgress(), cursor: { minId: '1' } }],
      [
        'a non-snowflake filter minId',
        { ...createProgress(), filters: { minId: '1', maxId: '666666666666666666' } },
      ],
      ['a non-snowflake filter maxId', { ...createProgress(), filters: { maxId: 'tomorrow' } }],
      ['a negative counter', { ...createProgress(), deletedCount: -1 }],
      ['a fractional counter', { ...createProgress(), skippedCount: 2.5 }],
      ['an infinite counter', { ...createProgress(), totalFound: Number.POSITIVE_INFINITY }],
      ['a timestamp far in the future', { ...createProgress(), timestamp: Date.now() + 600_000 }],
    ])('rejects %s', (_label, value) => {
      expect(isValidProgressData(value)).toBe(false);
    });

    it('accepts a guild-wide DM entry and a timestamp inside the skew allowance', () => {
      expect(isValidProgressData(createProgress({ guildId: '@me' }))).toBe(true);
      expect(isValidProgressData(createProgress({ timestamp: Date.now() + 60_000 }))).toBe(true);
    });

    it('removes a stored entry whose IDs are not snowflakes', () => {
      const key = `detcord_progress:v2:${AUTHOR}:${GUILD_KEY}`;
      storage.setItem(key, JSON.stringify(createProgress({ cursor: { maxId: '17' } })));

      expect(loadProgress(AUTHOR, GUILD_KEY)).toBeNull();
      expect(storage.getItem(key)).toBeNull();
    });

    it('accepts an oldest-first cursor', () => {
      expect(
        isValidProgressData(
          createProgress({ deletionOrder: 'oldest', cursor: { minId: '555555555555555555' } }),
        ),
      ).toBe(true);
    });
  });

  describe('save scheduling', () => {
    it('saves every tenth deletion', () => {
      expect(shouldSaveProgress(0)).toBe(false);
      expect(shouldSaveProgress(9)).toBe(false);
      expect(shouldSaveProgress(10)).toBe(true);
      expect(shouldSaveProgress(20)).toBe(true);
      expect(shouldSaveProgress(21)).toBe(false);
    });

    it('reports deletions remaining until the next save', () => {
      expect(getDeletionsUntilSave(0)).toBe(10);
      expect(getDeletionsUntilSave(3)).toBe(7);
      expect(getDeletionsUntilSave(10)).toBe(10);
    });
  });
});
