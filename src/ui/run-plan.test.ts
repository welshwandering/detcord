import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetPageStorage } from '../core/storage';
import { buildRunConfig, type RunConfig } from './run-config';
import {
  clearRunPlan,
  isValidRunPlan,
  loadRunPlan,
  type RunPlan,
  runPlanFor,
  saveRunPlan,
} from './run-plan';

const CHANNEL_A = '111111111111111111';
const CHANNEL_B = '222222222222222222';
const GUILD = '333333333333333333';

function plan(overrides: Partial<RunPlan> = {}): RunPlan {
  return {
    version: 1,
    authorId: 'author-1',
    scope: 'specific',
    channelIds: [CHANNEL_A, CHANNEL_B],
    index: 0,
    newestAllowed: Date.parse('2024-05-01T10:00:00Z'),
    hasLink: false,
    hasFile: false,
    includePinned: false,
    deletionOrder: 'newest',
    timeRangeLabel: 'Everything',
    completedTotals: { deleted: 3, failed: 0, skipped: 1, alreadyGone: 0 },
    savedAt: Date.parse('2024-05-01T10:05:00Z'),
    ...overrides,
  };
}

function config(): RunConfig {
  const result = buildRunConfig({
    authorId: 'author-1',
    scope: 'specific',
    guildId: GUILD,
    urlChannelId: CHANNEL_A,
    routePath: `/channels/${GUILD}/${CHANNEL_A}`,
    selectedChannelIds: [CHANNEL_A, CHANNEL_B],
    manualChannelId: '',
    after: new Date('2024-01-01T00:00:00Z'),
    before: new Date('2024-02-01T00:00:00Z'),
    newestAllowed: new Date('2024-05-01T10:00:00Z'),
    timeRangeLabel: 'Custom range',
    content: 'oops',
    pattern: '^gg$',
    hasLink: true,
    hasFile: false,
    includePinned: true,
    deletionOrder: 'newest',
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.config;
}

beforeEach(() => {
  resetPageStorage();
  window.localStorage.clear();
});

afterEach(() => {
  resetPageStorage();
  window.localStorage.clear();
});

describe('runPlanFor', () => {
  it('carries the target, the filters and the banked counters', () => {
    const built = runPlanFor(config(), 1, { deleted: 4, failed: 1, skipped: 2, alreadyGone: 3 });
    expect(built).toMatchObject({
      version: 1,
      authorId: 'author-1',
      scope: 'specific',
      channelIds: [CHANNEL_A, CHANNEL_B],
      index: 1,
      after: Date.parse('2024-01-01T00:00:00Z'),
      before: Date.parse('2024-02-01T00:00:00Z'),
      newestAllowed: Date.parse('2024-05-01T10:00:00Z'),
      content: 'oops',
      pattern: '^gg$',
      hasLink: true,
      includePinned: true,
      completedTotals: { deleted: 4, failed: 1, skipped: 2, alreadyGone: 3 },
    });
    expect(isValidRunPlan(built)).toBe(true);
  });

  it('omits filters that are not set rather than writing undefined', () => {
    const bare = buildRunConfig({
      authorId: 'author-1',
      scope: 'channel',
      guildId: null,
      urlChannelId: CHANNEL_A,
      routePath: `/channels/${GUILD}/${CHANNEL_A}`,
      selectedChannelIds: [],
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
    if (!bare.ok) {
      throw new Error(bare.error);
    }
    const built = runPlanFor(bare.config, 0, {
      deleted: 0,
      failed: 0,
      skipped: 0,
      alreadyGone: 0,
    });
    const keys = Object.keys(built);
    expect(keys).not.toContain('guildId');
    expect(keys).not.toContain('after');
    expect(keys).not.toContain('before');
    expect(keys).not.toContain('content');
    expect(keys).not.toContain('pattern');
    expect(isValidRunPlan(built)).toBe(true);
  });
});

describe('isValidRunPlan', () => {
  it('accepts a well-formed plan', () => {
    expect(isValidRunPlan(plan())).toBe(true);
  });

  it.each([
    ['a wrong version', { version: 2 }],
    ['no author', { authorId: '' }],
    ['an unknown scope', { scope: 'everything' }],
    ['a guild that is not a snowflake', { guildId: 'guild' }],
    ['no channels', { channelIds: [] }],
    ['a channel that is not a snowflake', { channelIds: ['nope'] }],
    ['an index past the end', { index: 2 }],
    ['a negative index', { index: -1 }],
    ['a fractional index', { index: 0.5 }],
    ['a non-numeric bound', { newestAllowed: 'today' }],
    ['a non-numeric after', { after: 'yesterday' }],
    ['a non-numeric before', { before: {} }],
    ['a non-string content filter', { content: 7 }],
    ['a non-boolean toggle', { hasLink: 'yes' }],
    ['an unknown deletion order', { deletionOrder: 'random' }],
    ['a non-string label', { timeRangeLabel: 3 }],
    ['negative counters', { completedTotals: { deleted: -1, failed: 0, skipped: 0 } }],
    ['no counters', { completedTotals: null }],
    ['no save time', { savedAt: 'later' }],
  ])('rejects %s', (_label, overrides) => {
    expect(isValidRunPlan({ ...plan(), ...overrides })).toBe(false);
  });

  it('rejects values that are not objects', () => {
    expect(isValidRunPlan(null)).toBe(false);
    expect(isValidRunPlan('plan')).toBe(false);
  });
});

describe('saveRunPlan and loadRunPlan', () => {
  it('round-trips a plan for one author', () => {
    saveRunPlan(plan());
    expect(loadRunPlan('author-1')).toEqual(plan());
    expect(loadRunPlan('author-2')).toBeNull();
  });

  it('stores nothing under a key another author would read', () => {
    saveRunPlan(plan());
    expect(window.localStorage.getItem('detcord_runplan:v1:author-1')).not.toBeNull();
  });

  it('discards a plan that is not valid JSON', () => {
    window.localStorage.setItem('detcord_runplan:v1:author-1', '{not json');
    expect(loadRunPlan('author-1')).toBeNull();
    expect(window.localStorage.getItem('detcord_runplan:v1:author-1')).toBeNull();
  });

  it('discards a corrupt plan instead of resuming from it', () => {
    window.localStorage.setItem(
      'detcord_runplan:v1:author-1',
      JSON.stringify({ ...plan(), channelIds: ['not-a-channel'] }),
    );
    expect(loadRunPlan('author-1')).toBeNull();
    expect(window.localStorage.getItem('detcord_runplan:v1:author-1')).toBeNull();
  });

  it('discards a plan filed under the wrong author', () => {
    window.localStorage.setItem(
      'detcord_runplan:v1:author-1',
      JSON.stringify(plan({ authorId: 'author-2' })),
    );
    expect(loadRunPlan('author-1')).toBeNull();
  });

  it('clears a plan', () => {
    saveRunPlan(plan());
    clearRunPlan('author-1');
    expect(loadRunPlan('author-1')).toBeNull();
  });

  it('survives a storage that refuses every real read and write', () => {
    const probeKey = '__detcord_storage_probe__';
    const failing = {
      length: 0,
      clear: (): void => {},
      key: (): string | null => null,
      getItem: (key: string): string | null => {
        if (key.startsWith(probeKey)) {
          return null;
        }
        throw new Error('blocked');
      },
      setItem: (key: string): void => {
        if (!key.startsWith(probeKey)) {
          throw new Error('blocked');
        }
      },
      removeItem: (key: string): void => {
        if (!key.startsWith(probeKey)) {
          throw new Error('blocked');
        }
      },
    };
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { value: failing, configurable: true });
    resetPageStorage();

    expect(() => saveRunPlan(plan())).not.toThrow();
    expect(loadRunPlan('author-1')).toBeNull();
    expect(() => clearRunPlan('author-1')).not.toThrow();

    if (original) {
      Object.defineProperty(window, 'localStorage', original);
    }
    resetPageStorage();
  });
});
