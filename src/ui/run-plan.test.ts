import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetPageStorage } from '../core/storage';
import { buildRunConfig, type RunConfig } from './run-config';
import {
  clearRunPlan,
  isValidRunPlan,
  loadRunPlan,
  pruneRunPlans,
  type RunPlan,
  runPlanFor,
  saveRunPlan,
} from './run-plan';

const CHANNEL_A = '111111111111111111';
const CHANNEL_B = '222222222222222222';
const GUILD = '333333333333333333';
const RUN = 'run-1';
const DAY_MS = 24 * 60 * 60 * 1000;

function plan(overrides: Partial<RunPlan> = {}): RunPlan {
  return {
    version: 2,
    runId: RUN,
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
    savedAt: Date.now(),
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
  it('carries the run ID, the target, the filters and the banked counters', () => {
    const built = runPlanFor(config(), {
      runId: RUN,
      index: 1,
      completedTotals: { deleted: 4, failed: 1, skipped: 2, alreadyGone: 3 },
      expectedTotal: 40,
    });
    expect(built).toMatchObject({
      version: 2,
      runId: RUN,
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
      expectedTotal: 40,
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
    const built = runPlanFor(bare.config, {
      runId: RUN,
      index: 0,
      completedTotals: { deleted: 0, failed: 0, skipped: 0, alreadyGone: 0 },
      expectedTotal: null,
    });
    const keys = Object.keys(built);
    expect(keys).not.toContain('guildId');
    expect(keys).not.toContain('after');
    expect(keys).not.toContain('before');
    expect(keys).not.toContain('content');
    expect(keys).not.toContain('pattern');
    expect(keys).not.toContain('expectedTotal');
    expect(isValidRunPlan(built)).toBe(true);
  });
});

describe('isValidRunPlan', () => {
  it('accepts a well-formed plan', () => {
    expect(isValidRunPlan(plan())).toBe(true);
  });

  it.each([
    ['a v1 plan', { version: 1 }],
    ['no author', { authorId: '' }],
    ['no run ID', { runId: '' }],
    ['a run ID that is not a string', { runId: 7 }],
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
    ['a negative expected total', { expectedTotal: -4 }],
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
  it('round-trips a plan for one run', () => {
    const written = plan();
    saveRunPlan(written);
    expect(loadRunPlan('author-1', RUN)).toEqual(written);
    expect(loadRunPlan('author-2', RUN)).toBeNull();
  });

  it('files the plan under the author and the run', () => {
    saveRunPlan(plan());
    expect(window.localStorage.getItem('detcord_runplan:v2:author-1:run-1')).not.toBeNull();
  });

  it('keeps two runs for one account apart instead of overwriting', () => {
    saveRunPlan(plan({ runId: 'run-1', channelIds: [CHANNEL_A], index: 0 }));
    saveRunPlan(plan({ runId: 'run-2', channelIds: [CHANNEL_B], index: 0 }));

    expect(loadRunPlan('author-1', 'run-1')?.channelIds).toEqual([CHANNEL_A]);
    expect(loadRunPlan('author-1', 'run-2')?.channelIds).toEqual([CHANNEL_B]);
  });

  it('has no plan for a run that never wrote one', () => {
    saveRunPlan(plan());
    expect(loadRunPlan('author-1', 'some-other-run')).toBeNull();
  });

  it('discards a plan that is not valid JSON', () => {
    window.localStorage.setItem('detcord_runplan:v2:author-1:run-1', '{not json');
    expect(loadRunPlan('author-1', RUN)).toBeNull();
    expect(window.localStorage.getItem('detcord_runplan:v2:author-1:run-1')).toBeNull();
  });

  it('discards a corrupt plan instead of resuming from it', () => {
    window.localStorage.setItem(
      'detcord_runplan:v2:author-1:run-1',
      JSON.stringify({ ...plan(), channelIds: ['not-a-channel'] }),
    );
    expect(loadRunPlan('author-1', RUN)).toBeNull();
    expect(window.localStorage.getItem('detcord_runplan:v2:author-1:run-1')).toBeNull();
  });

  it('discards a plan filed under the wrong author or run', () => {
    window.localStorage.setItem(
      'detcord_runplan:v2:author-1:run-1',
      JSON.stringify(plan({ authorId: 'author-2' })),
    );
    expect(loadRunPlan('author-1', RUN)).toBeNull();

    window.localStorage.setItem(
      'detcord_runplan:v2:author-1:run-1',
      JSON.stringify(plan({ runId: 'run-9' })),
    );
    expect(loadRunPlan('author-1', RUN)).toBeNull();
  });

  it('discards a plan older than a day', () => {
    saveRunPlan(plan({ savedAt: Date.now() - DAY_MS - 1000 }));
    expect(loadRunPlan('author-1', RUN)).toBeNull();
    expect(window.localStorage.getItem('detcord_runplan:v2:author-1:run-1')).toBeNull();
  });

  it('removes a v1 entry for the author on sight', () => {
    window.localStorage.setItem('detcord_runplan:v1:author-1', JSON.stringify({ version: 1 }));
    expect(loadRunPlan('author-1', RUN)).toBeNull();
    expect(window.localStorage.getItem('detcord_runplan:v1:author-1')).toBeNull();
  });

  it('clears a plan by run', () => {
    saveRunPlan(plan({ runId: 'run-1' }));
    saveRunPlan(plan({ runId: 'run-2' }));
    clearRunPlan('author-1', 'run-1');
    expect(loadRunPlan('author-1', 'run-1')).toBeNull();
    expect(loadRunPlan('author-1', 'run-2')).not.toBeNull();
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
    expect(loadRunPlan('author-1', RUN)).toBeNull();
    expect(() => clearRunPlan('author-1', RUN)).not.toThrow();
    expect(() => pruneRunPlans('author-1')).not.toThrow();

    if (original) {
      Object.defineProperty(window, 'localStorage', original);
    }
    resetPageStorage();
  });
});

describe('pruneRunPlans', () => {
  it('removes expired, malformed and legacy entries but keeps live plans', () => {
    saveRunPlan(plan({ runId: 'live' }));
    saveRunPlan(plan({ runId: 'stale', savedAt: Date.now() - DAY_MS - 1000 }));
    window.localStorage.setItem('detcord_runplan:v2:author-1:broken', '{not json');
    window.localStorage.setItem('detcord_runplan:v1:author-1', JSON.stringify({ version: 1 }));
    window.localStorage.setItem(
      'detcord_runplan:v2:author-2:live',
      JSON.stringify(plan({ authorId: 'author-2', runId: 'live' })),
    );

    pruneRunPlans('author-1');

    expect(loadRunPlan('author-1', 'live')).not.toBeNull();
    expect(window.localStorage.getItem('detcord_runplan:v2:author-1:stale')).toBeNull();
    expect(window.localStorage.getItem('detcord_runplan:v2:author-1:broken')).toBeNull();
    expect(window.localStorage.getItem('detcord_runplan:v1:author-1')).toBeNull();
    // Another account's plans are none of this author's business.
    expect(window.localStorage.getItem('detcord_runplan:v2:author-2:live')).not.toBeNull();
  });
});
