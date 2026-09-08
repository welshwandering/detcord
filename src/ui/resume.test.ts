import { describe, expect, it } from 'vitest';
import { dateToSnowflake } from '../utils/helpers';
import type { SavedProgress } from './ports';
import {
  configForSavedSession,
  describeSavedSession,
  resumePlanFor,
  savedSessionTarget,
} from './resume';
import type { RunPlan } from './run-plan';

const CHANNEL_A = '111111111111111111';
const CHANNEL_B = '222222222222222222';
const CHANNEL_C = '333333333333333333';
const GUILD = '444444444444444444';
const ROUTE = `/channels/${GUILD}/${CHANNEL_B}`;
const CAPTURED = Date.parse('2024-05-01T10:00:00Z');

function saved(overrides: Partial<SavedProgress> = {}): SavedProgress {
  return {
    version: 2,
    runId: 'run-1',
    authorId: 'author-1',
    channelId: CHANNEL_B,
    deletionOrder: 'newest',
    cursor: { maxId: '900000000000000000' },
    deletedCount: 12,
    failedCount: 1,
    skippedCount: 2,
    alreadyGoneCount: 0,
    totalFound: 40,
    initialTotalFound: 40,
    timestamp: Date.parse('2024-05-01T10:04:00Z'),
    ...overrides,
  };
}

/** A session with no channel recorded, as a server-wide run leaves behind. */
function savedWithoutChannel(overrides: Partial<SavedProgress> = {}): SavedProgress {
  const { channelId: _dropped, ...rest } = saved();
  return { ...rest, ...overrides };
}

function plan(overrides: Partial<RunPlan> = {}): RunPlan {
  return {
    version: 1,
    authorId: 'author-1',
    scope: 'specific',
    channelIds: [CHANNEL_A, CHANNEL_B, CHANNEL_C],
    index: 1,
    newestAllowed: CAPTURED,
    content: 'oops',
    hasLink: true,
    hasFile: false,
    includePinned: true,
    deletionOrder: 'newest',
    timeRangeLabel: 'Everything',
    completedTotals: { deleted: 7, failed: 0, skipped: 1, alreadyGone: 2 },
    savedAt: CAPTURED,
    ...overrides,
  };
}

describe('describeSavedSession', () => {
  it('names the progress and the channel', () => {
    expect(describeSavedSession(saved())).toContain('12 of 40 done');
    expect(describeSavedSession(saved())).toContain(CHANNEL_B);
  });

  it('names a server target', () => {
    const text = describeSavedSession(savedWithoutChannel({ guildId: GUILD }));
    expect(text).toContain(`server ${GUILD}`);
  });
});

describe('resumePlanFor with a run plan', () => {
  it('continues into every channel queued behind the interrupted one', () => {
    const resume = resumePlanFor(saved(), null, ROUTE, plan());
    expect(resume).not.toBeNull();
    expect(resume?.config.channelIds).toEqual([CHANNEL_B, CHANNEL_C]);
    expect(resume?.config.scope).toBe('specific');
    expect(resume?.baseTotals).toEqual({ deleted: 7, failed: 0, skipped: 1, alreadyGone: 2 });
  });

  it('restores every filter the plan recorded', () => {
    const resume = resumePlanFor(
      saved(),
      null,
      ROUTE,
      plan({ after: Date.parse('2024-01-01T00:00:00Z'), pattern: '^gg$' }),
    );
    expect(resume?.config).toMatchObject({
      content: 'oops',
      pattern: '^gg$',
      hasLink: true,
      hasFile: false,
      includePinned: true,
    });
    expect(resume?.config.after?.getTime()).toBe(Date.parse('2024-01-01T00:00:00Z'));
  });

  it('reuses the upper bound captured when the run was built', () => {
    const resume = resumePlanFor(saved(), null, ROUTE, plan());
    expect(resume?.config.newestAllowed.getTime()).toBe(CAPTURED);
  });

  it('ignores a plan belonging to another account', () => {
    const resume = resumePlanFor(saved(), null, ROUTE, plan({ authorId: 'author-2' }));
    expect(resume?.config.channelIds).toEqual([CHANNEL_B]);
    expect(resume?.baseTotals).toBeNull();
  });

  it('ignores a plan that does not list the interrupted channel', () => {
    const resume = resumePlanFor(saved(), null, ROUTE, plan({ channelIds: [CHANNEL_A] }));
    expect(resume?.config.channelIds).toEqual([CHANNEL_B]);
    expect(resume?.baseTotals).toBeNull();
  });

  it('ignores a plan when the session recorded no channel', () => {
    const resume = resumePlanFor(savedWithoutChannel({ guildId: GUILD }), CHANNEL_A, ROUTE, plan());
    expect(resume?.config.scope).toBe('server');
    expect(resume?.baseTotals).toBeNull();
  });

  it('falls back when the plan cannot produce a valid config', () => {
    const resume = resumePlanFor(saved(), null, ROUTE, plan({ scope: 'server', guildId: '@me' }));
    expect(resume?.config.channelIds).toEqual([CHANNEL_B]);
    expect(resume?.baseTotals).toBeNull();
  });
});

describe('configForSavedSession', () => {
  it('rebuilds a single channel run from the saved filters', () => {
    const config = configForSavedSession(
      saved({
        filters: {
          content: 'hello',
          hasLink: true,
          includePinned: true,
          minId: dateToSnowflake(new Date('2024-01-01T00:00:00Z')),
          maxId: dateToSnowflake(new Date(CAPTURED)),
        },
      }),
      null,
      ROUTE,
    );
    expect(config?.channelIds).toEqual([CHANNEL_B]);
    expect(config?.content).toBe('hello');
    expect(config?.hasLink).toBe(true);
    // The bound the original run was given is reused, not a fresh "now".
    expect(config?.newestAllowed.getTime()).toBe(CAPTURED);
  });

  it('uses the open channel when the session recorded none', () => {
    const config = configForSavedSession(savedWithoutChannel(), CHANNEL_A, ROUTE);
    expect(config?.channelIds).toEqual([CHANNEL_A]);
  });

  it('gives up when there is no channel at all', () => {
    expect(configForSavedSession(savedWithoutChannel(), null, ROUTE)).toBeNull();
    expect(resumePlanFor(savedWithoutChannel(), null, ROUTE, null)).toBeNull();
  });

  it('gives up when the rebuilt config would be invalid', () => {
    const config = configForSavedSession(saved({ channelId: 'not-a-channel' }), null, ROUTE);
    expect(config).toBeNull();
  });
});

describe('savedSessionTarget', () => {
  it('omits the values that are absent', () => {
    expect(savedSessionTarget(saved())).toEqual({ channelId: CHANNEL_B });
    expect(savedSessionTarget(savedWithoutChannel({ guildId: GUILD }))).toEqual({
      guildId: GUILD,
    });
  });
});
