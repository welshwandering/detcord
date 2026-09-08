import { describe, expect, it } from 'vitest';
import { dateToSnowflake, snowflakeToDate } from '../utils/helpers';
import type { SavedProgress } from './ports';
import {
  configForSavedSession,
  describeSavedSession,
  resumePlanFor,
  runPlanApplies,
  savedSessionTarget,
} from './resume';
import { engineOptionsFor } from './run-config';
import type { RunPlan } from './run-plan';

const CHANNEL_A = '111111111111111111';
const CHANNEL_B = '222222222222222222';
const CHANNEL_C = '333333333333333333';
const GUILD = '444444444444444444';
const ROUTE = `/channels/${GUILD}/${CHANNEL_B}`;
const CAPTURED = Date.parse('2024-05-01T10:00:00Z');
const RUN = 'run-1';

function saved(overrides: Partial<SavedProgress> = {}): SavedProgress {
  return {
    version: 2,
    runId: RUN,
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
    version: 2,
    runId: RUN,
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

  it('states the channels a plan would carry the run into', () => {
    const text = describeSavedSession(saved(), plan());
    expect(text).toContain(`12 of 40 done in channel ${CHANNEL_B}`);
    expect(text).toContain('then 1 more channel.');
  });

  it('counts more than one queued channel', () => {
    const text = describeSavedSession(saved({ channelId: CHANNEL_A }), plan({ index: 0 }));
    expect(text).toContain('then 2 more channels');
  });

  it('promises nothing beyond the checkpoint when the plan is the last channel', () => {
    const text = describeSavedSession(saved({ channelId: CHANNEL_C }), plan({ index: 2 }));
    expect(text).not.toContain('more channel');
  });

  it('promises nothing beyond the checkpoint for a plan of another run', () => {
    const text = describeSavedSession(saved(), plan({ runId: 'other-run' }));
    expect(text).not.toContain('more channel');
  });
});

describe('runPlanApplies', () => {
  it('pairs a plan with the checkpoint of its own run only', () => {
    expect(runPlanApplies(plan(), saved())).toBe(true);
    expect(runPlanApplies(plan({ runId: 'other-run' }), saved())).toBe(false);
    expect(runPlanApplies(plan({ authorId: 'author-2' }), saved())).toBe(false);
    // The channel is in the list, but not the one the plan had reached.
    expect(runPlanApplies(plan({ index: 0 }), saved())).toBe(false);
    expect(runPlanApplies(plan(), savedWithoutChannel({ guildId: GUILD }))).toBe(false);
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

  it('keeps the upper bound and the attachment filter for every queued channel', () => {
    const before = Date.parse('2024-03-01T00:00:00Z');
    const resume = resumePlanFor(saved(), null, ROUTE, plan({ before, hasFile: true }));

    expect(resume?.config.before?.getTime()).toBe(before);
    expect(resume?.config.hasFile).toBe(true);
    expect(resume?.config.channelIds).toEqual([CHANNEL_B, CHANNEL_C]);

    const config = resume?.config;
    if (!config) {
      throw new Error('no config');
    }
    for (const channelId of config.channelIds) {
      const options = engineOptionsFor(config, channelId, 'token', 'run-1');
      // `before` is older than the captured bound, so it is the bound that
      // survives into every leg of the resumed run.
      expect(snowflakeToDate(options.maxId as string).getTime()).toBe(before);
      expect(options.hasFile).toBe(true);
      expect(options.channelId).toBe(channelId);
      expect(options.runId).toBe('run-1');
    }
  });

  it('carries the expected total the review step counted', () => {
    expect(resumePlanFor(saved(), null, ROUTE, plan({ expectedTotal: 40 }))?.expectedTotal).toBe(
      40,
    );
    expect(resumePlanFor(saved(), null, ROUTE, plan())?.expectedTotal).toBeNull();
  });

  it('reuses the upper bound captured when the run was built', () => {
    const resume = resumePlanFor(saved(), null, ROUTE, plan());
    expect(resume?.config.newestAllowed.getTime()).toBe(CAPTURED);
  });

  it('ignores a plan belonging to another run of the same account', () => {
    const resume = resumePlanFor(saved(), null, ROUTE, plan({ runId: 'run-2' }));
    expect(resume?.config.channelIds).toEqual([CHANNEL_B]);
    expect(resume?.baseTotals).toBeNull();
    expect(resume?.expectedTotal).toBeNull();
  });

  it('ignores a plan belonging to another account', () => {
    const resume = resumePlanFor(saved(), null, ROUTE, plan({ authorId: 'author-2' }));
    expect(resume?.config.channelIds).toEqual([CHANNEL_B]);
    expect(resume?.baseTotals).toBeNull();
  });

  it('ignores a plan whose position is a different channel', () => {
    // The checkpoint's channel is in the list, but the plan had reached the
    // first channel, so the two describe different moments of different runs.
    const resume = resumePlanFor(saved(), null, ROUTE, plan({ index: 0 }));
    expect(resume?.config.channelIds).toEqual([CHANNEL_B]);
    expect(resume?.baseTotals).toBeNull();
  });

  it('ignores a plan that does not list the interrupted channel', () => {
    const resume = resumePlanFor(saved(), null, ROUTE, plan({ channelIds: [CHANNEL_A], index: 0 }));
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
