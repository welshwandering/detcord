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
const CHANNEL_KEY = 'c:444444444444444444';
const RUN = 'run-1';

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
    it('round-trips a v2 entry under the per-run key', () => {
      const progress = createProgress();
      saveProgress(progress);

      expect(storage.getItem(`detcord_progress:v2:${AUTHOR}:${GUILD_KEY}:${RUN}`)).not.toBeNull();
      expect(loadProgress(AUTHOR, GUILD_KEY, RUN)).toEqual(progress);
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

      expect(loadProgress(AUTHOR, GUILD_KEY, RUN)?.deletedCount).toBe(10);
      expect(loadProgress(AUTHOR, CHANNEL_KEY, 'run-2')?.deletedCount).toBe(99);
    });

    it('keeps two runs over the same target apart', () => {
      saveProgress(createProgress({ runId: 'run-one', deletedCount: 10 }));
      saveProgress(createProgress({ runId: 'run-two', deletedCount: 99 }));

      expect(storage.length).toBe(2);
      expect(loadProgress(AUTHOR, GUILD_KEY, 'run-one')?.deletedCount).toBe(10);
      expect(loadProgress(AUTHOR, GUILD_KEY, 'run-two')?.deletedCount).toBe(99);
    });

    it('returns null when nothing is stored', () => {
      expect(loadProgress(AUTHOR, GUILD_KEY, RUN)).toBeNull();
    });

    it('returns null and does not throw when no storage is available', () => {
      storageState.current = null;
      expect(() => saveProgress(createProgress())).not.toThrow();
      expect(loadProgress(AUTHOR, GUILD_KEY, RUN)).toBeNull();
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
      const key = `detcord_progress:v2:${AUTHOR}:${GUILD_KEY}:${RUN}`;
      storage.setItem(key, '{not json');

      expect(loadProgress(AUTHOR, GUILD_KEY, RUN)).toBeNull();
      expect(storage.getItem(key)).toBeNull();
    });

    it('removes an entry that fails schema validation', () => {
      const key = `detcord_progress:v2:${AUTHOR}:${GUILD_KEY}:${RUN}`;
      storage.setItem(key, JSON.stringify({ version: 2, authorId: AUTHOR }));

      expect(loadProgress(AUTHOR, GUILD_KEY, RUN)).toBeNull();
      expect(storage.getItem(key)).toBeNull();
    });

    it('removes an entry older than 24 hours', () => {
      const key = `detcord_progress:v2:${AUTHOR}:${GUILD_KEY}:${RUN}`;
      saveProgress(createProgress({ timestamp: Date.now() - 25 * 60 * 60 * 1000 }));

      expect(loadProgress(AUTHOR, GUILD_KEY, RUN)).toBeNull();
      expect(storage.getItem(key)).toBeNull();
    });

    it('keeps an entry just inside the expiry window', () => {
      saveProgress(createProgress({ timestamp: Date.now() - 23 * 60 * 60 * 1000 }));
      expect(loadProgress(AUTHOR, GUILD_KEY, RUN)).not.toBeNull();
    });

    it('returns null when the storage read throws', () => {
      storageState.current = {
        ...storage,
        getItem: () => {
          throw new Error('blocked');
        },
      } as unknown as Storage;

      expect(loadProgress(AUTHOR, GUILD_KEY, RUN)).toBeNull();
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
      loadProgress(AUTHOR, GUILD_KEY, RUN);
      expect(storage.getItem('detcord_progress')).toBeNull();
    });

    it('removes the legacy key when scanning for resumable sessions', () => {
      storage.setItem('detcord_progress', '{}');
      findResumableSession(AUTHOR);
      expect(storage.getItem('detcord_progress')).toBeNull();
    });

    it('never resumes from a v1 payload', () => {
      storage.setItem(
        `detcord_progress:v2:${AUTHOR}:${GUILD_KEY}:${RUN}`,
        JSON.stringify({
          authorId: AUTHOR,
          lastMaxId: '1',
          deletedCount: 3,
          timestamp: Date.now(),
        }),
      );
      expect(loadProgress(AUTHOR, GUILD_KEY, RUN)).toBeNull();
    });
  });

  describe('legacy v2 key layout', () => {
    it('removes an entry stored without a run ID and never returns it', () => {
      const oldKey = `detcord_progress:v2:${AUTHOR}:${GUILD_KEY}`;
      storage.setItem(oldKey, JSON.stringify(createProgress()));

      expect(findResumableSession(AUTHOR)).toBeNull();
      expect(storage.getItem(oldKey)).toBeNull();
    });

    it('removes an old-layout entry on save without touching current entries', () => {
      const oldKey = `detcord_progress:v2:${AUTHOR}:all`;
      storage.setItem(oldKey, JSON.stringify(createProgress({ guildId: undefined })));

      saveProgress(createProgress());

      expect(storage.getItem(oldKey)).toBeNull();
      expect(loadProgress(AUTHOR, GUILD_KEY, RUN)?.runId).toBe(RUN);
    });

    it('removes a key whose run-ID segment is empty', () => {
      const emptyRun = `detcord_progress:v2:${AUTHOR}:${GUILD_KEY}:`;
      storage.setItem(emptyRun, JSON.stringify(createProgress()));

      expect(findResumableSession(AUTHOR)).toBeNull();
      expect(storage.getItem(emptyRun)).toBeNull();
    });

    it('removes an old-layout channel entry on load', () => {
      const oldKey = `detcord_progress:v2:${AUTHOR}:${CHANNEL_KEY}`;
      storage.setItem(oldKey, JSON.stringify(createProgress({ guildId: undefined })));

      expect(loadProgress(AUTHOR, CHANNEL_KEY, RUN)).toBeNull();
      expect(storage.getItem(oldKey)).toBeNull();
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

    it('leaves an earlier run resumable after a later run over the same target is cleared', () => {
      // The stopped-then-restarted scenario: run one halts part way through
      // channel A, run two sweeps the same channel and finishes. Clearing run
      // two must leave run one's checkpoint discoverable, or the rest of run
      // one's channels are silently never swept.
      const target = { guildId: undefined, channelId: '444444444444444444' };
      saveProgress(
        createProgress({
          ...target,
          runId: 'run-one',
          deletedCount: 5,
          timestamp: Date.now() - 60_000,
        }),
      );
      saveProgress(
        createProgress({ ...target, runId: 'run-two', deletedCount: 40, timestamp: Date.now() }),
      );

      expect(findResumableSession(AUTHOR)?.runId).toBe('run-two');

      clearProgress(AUTHOR, CHANNEL_KEY, 'run-two');

      const resumable = findResumableSession(AUTHOR);
      expect(resumable?.runId).toBe('run-one');
      expect(resumable?.deletedCount).toBe(5);
    });

    it('ignores entries belonging to another author', () => {
      saveProgress(createProgress({ authorId: '999999999999999999' }));
      expect(findResumableSession(AUTHOR)).toBeNull();
    });

    it('skips and removes expired entries while scanning', () => {
      saveProgress(createProgress({ timestamp: Date.now() - 48 * 60 * 60 * 1000 }));
      expect(findResumableSession(AUTHOR)).toBeNull();
      expect(storage.getItem(`detcord_progress:v2:${AUTHOR}:${GUILD_KEY}:${RUN}`)).toBeNull();
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
    it('removes every run for the target and nothing for another target', () => {
      saveProgress(createProgress());
      saveProgress(createProgress({ runId: 'run-2', deletedCount: 20 }));
      saveProgress(
        createProgress({ guildId: undefined, channelId: '444444444444444444', runId: 'keep' }),
      );

      clearProgress(AUTHOR, GUILD_KEY);

      expect(loadProgress(AUTHOR, GUILD_KEY, RUN)).toBeNull();
      expect(loadProgress(AUTHOR, GUILD_KEY, 'run-2')).toBeNull();
      expect(loadProgress(AUTHOR, CHANNEL_KEY, 'keep')?.runId).toBe('keep');
    });

    it('swallows removal failures', () => {
      saveProgress(createProgress());
      storageState.current = {
        ...storage,
        getItem: () => null,
        removeItem: () => {
          throw new Error('blocked');
        },
      } as unknown as Storage;

      expect(() => clearProgress(AUTHOR, GUILD_KEY)).not.toThrow();
    });

    it('returns quietly when key enumeration throws', () => {
      saveProgress(createProgress());
      storageState.current = {
        ...storage,
        getItem: () => null,
        key: () => {
          throw new Error('blocked');
        },
        get length(): number {
          return 1;
        },
      } as unknown as Storage;

      expect(() => clearProgress(AUTHOR, GUILD_KEY)).not.toThrow();
    });

    it('removes the entry when the run ID matches', () => {
      saveProgress(createProgress({ runId: 'run-a' }));

      clearProgress(AUTHOR, GUILD_KEY, 'run-a');

      expect(loadProgress(AUTHOR, GUILD_KEY, 'run-a')).toBeNull();
    });

    it('keeps a checkpoint written by another run', () => {
      // A second run over the same target, or the same account in another tab:
      // the run that finishes first must not erase the checkpoint the other
      // one is still relying on.
      saveProgress(createProgress({ runId: 'other-tab' }));

      clearProgress(AUTHOR, GUILD_KEY, 'this-tab');

      expect(loadProgress(AUTHOR, GUILD_KEY, 'other-tab')?.runId).toBe('other-tab');
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
      const key = `detcord_progress:v2:${AUTHOR}:${GUILD_KEY}:${RUN}`;
      storage.setItem(key, JSON.stringify(createProgress({ cursor: { maxId: '17' } })));

      expect(loadProgress(AUTHOR, GUILD_KEY, RUN)).toBeNull();
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
