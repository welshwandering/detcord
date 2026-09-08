import { describe, expect, it } from 'vitest';
import { dateToSnowflake, snowflakeToDate } from '../utils/helpers';
import {
  buildRunConfig,
  describeRangePhrase,
  describeRunConfig,
  describeTarget,
  describeTimeRange,
  engineOptionsFor,
  newestBoundary,
  type RunConfigInput,
  runConfigSignature,
} from './run-config';

const CHANNEL_A = '111111111111111111';
const CHANNEL_B = '222222222222222222';
const GUILD = '333333333333333333';

function input(overrides: Partial<RunConfigInput> = {}): RunConfigInput {
  return {
    authorId: 'author-1',
    scope: 'channel',
    guildId: GUILD,
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
    ...overrides,
  };
}

function unwrap(result: ReturnType<typeof buildRunConfig>) {
  if (!result.ok) {
    throw new Error(`expected ok, got: ${result.error}`);
  }
  return result.config;
}

describe('buildRunConfig', () => {
  it('resolves the current channel for the channel scope', () => {
    const config = unwrap(buildRunConfig(input()));
    expect(config.channelIds).toEqual([CHANNEL_A]);
    expect(config.guildId).toBeUndefined();
    expect(config.routePath).toBe(`/channels/${GUILD}/${CHANNEL_A}`);
  });

  it('freezes the config so it cannot drift after the review step', () => {
    const config = unwrap(buildRunConfig(input()));
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('rejects a specific target with nothing selected instead of falling back', () => {
    const result = buildRunConfig(input({ scope: 'specific' }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/at least one channel/i);
  });

  it('rejects a manual channel ID that is not a snowflake', () => {
    const result = buildRunConfig(input({ scope: 'specific', manualChannelId: 'not-an-id' }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/not a valid Discord channel ID/);
  });

  it('accepts a manual channel ID that is a snowflake', () => {
    const config = unwrap(buildRunConfig(input({ scope: 'specific', manualChannelId: CHANNEL_B })));
    expect(config.channelIds).toEqual([CHANNEL_B]);
  });

  it('keeps every picked channel, in order, without duplicating the manual entry', () => {
    const config = unwrap(
      buildRunConfig(
        input({
          scope: 'specific',
          selectedChannelIds: [CHANNEL_A, CHANNEL_B],
          manualChannelId: CHANNEL_B,
        }),
      ),
    );
    expect(config.channelIds).toEqual([CHANNEL_A, CHANNEL_B]);
  });

  it('accepts a selection right up to the cap', () => {
    const channels = Array.from({ length: 25 }, (_, i) => `1111111111111111${String(10 + i)}`);
    const config = unwrap(
      buildRunConfig(input({ scope: 'specific', selectedChannelIds: channels })),
    );
    expect(config.channelIds).toHaveLength(25);
  });

  it('refuses more channels than a single run previews', () => {
    const channels = Array.from({ length: 26 }, (_, i) => `1111111111111111${String(10 + i)}`);
    const result = buildRunConfig(input({ scope: 'specific', selectedChannelIds: channels }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe('Select up to 25 channels per run.');
  });

  it('captures the instant it was built as the upper bound', () => {
    const before = Date.now();
    const config = unwrap(buildRunConfig(input()));
    const after = Date.now();
    expect(config.newestAllowed.getTime()).toBeGreaterThanOrEqual(before);
    expect(config.newestAllowed.getTime()).toBeLessThanOrEqual(after);
  });

  it('reuses a supplied upper bound, for a resumed run', () => {
    const captured = new Date('2024-03-04T05:06:07Z');
    const config = unwrap(buildRunConfig(input({ newestAllowed: captured })));
    expect(config.newestAllowed).toEqual(captured);
  });

  it('rejects a server target outside a server', () => {
    const result = buildRunConfig(input({ scope: 'server', guildId: '@me' }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/needs a server/);
  });

  it('keeps the guild for a server target', () => {
    const config = unwrap(buildRunConfig(input({ scope: 'server' })));
    expect(config.guildId).toBe(GUILD);
    expect(config.channelIds).toEqual([CHANNEL_A]);
  });

  it('rejects an inverted date range', () => {
    const result = buildRunConfig(
      input({ after: new Date('2024-06-01T00:00:00Z'), before: new Date('2024-01-01T00:00:00Z') }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/must be before/);
  });

  it('rejects a regex that validateRegex refuses', () => {
    const result = buildRunConfig(input({ pattern: '(a+)+' }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/performance/i);
  });

  it('rejects an unparseable regex', () => {
    const result = buildRunConfig(input({ pattern: '([unclosed' }));
    expect(result.ok).toBe(false);
  });

  it('requires an author ID', () => {
    const result = buildRunConfig(input({ authorId: null }));
    expect(result.ok).toBe(false);
  });
});

describe('runConfigSignature', () => {
  it('matches for two identical configs', () => {
    const a = unwrap(buildRunConfig(input()));
    const b = unwrap(buildRunConfig(input()));
    expect(runConfigSignature(a)).toBe(runConfigSignature(b));
  });

  it('differs when the route changes', () => {
    const a = unwrap(buildRunConfig(input()));
    const b = unwrap(buildRunConfig(input({ routePath: '/channels/@me/999' })));
    expect(runConfigSignature(a)).not.toBe(runConfigSignature(b));
  });

  it('differs when a filter changes', () => {
    const a = unwrap(buildRunConfig(input()));
    const b = unwrap(buildRunConfig(input({ hasLink: true })));
    expect(runConfigSignature(a)).not.toBe(runConfigSignature(b));
  });

  it('differs when the upper bound changes', () => {
    const a = unwrap(buildRunConfig(input({ newestAllowed: new Date('2024-01-01T00:00:00Z') })));
    const b = unwrap(buildRunConfig(input({ newestAllowed: new Date('2024-01-01T00:00:01Z') })));
    expect(runConfigSignature(a)).not.toBe(runConfigSignature(b));
  });
});

describe('describeRunConfig', () => {
  it('names the channel and the resolved range', () => {
    const after = new Date(2024, 0, 2, 3, 4);
    const config = unwrap(buildRunConfig(input({ after, timeRangeLabel: 'Last 24 hours' })));
    const lines = describeRunConfig(config);
    expect(lines[0]?.value).toContain(CHANNEL_A);
    expect(lines[1]?.value).toContain('Last 24 hours');
    expect(lines[1]?.value).toContain(after.toLocaleDateString());
  });

  it('names every line, so callers need not match on labels', () => {
    const config = unwrap(buildRunConfig(input()));
    expect(describeRunConfig(config).map((line) => line.key)).toEqual([
      'target',
      'range',
      'cutoff',
      'filters',
    ]);
  });

  it('lists the filters that are on, in receipt wording', () => {
    const config = unwrap(
      buildRunConfig(input({ hasLink: true, includePinned: true, content: 'hello' })),
    );
    const filters = describeRunConfig(config)[3]?.value ?? '';
    expect(filters).toContain('with links');
    expect(filters).toContain('pinned included');
    expect(filters).toContain('"hello"');
  });

  it('says pinned messages are kept when they are not included', () => {
    const config = unwrap(buildRunConfig(input({ hasFile: true })));
    const filters = describeRunConfig(config)[3]?.value ?? '';
    expect(filters).toBe('with attachments, pinned kept');
  });

  it('labels the upper bound and leaves the value to the date alone', () => {
    const captured = new Date(2024, 4, 6, 7, 8);
    const config = unwrap(buildRunConfig(input({ newestAllowed: captured })));
    const cutoff = describeRunConfig(config)[2];
    expect(cutoff?.label).toBe('Messages up to');
    expect(cutoff?.value).toContain(captured.toLocaleDateString());
    expect(cutoff?.value).not.toContain('Messages up to');
  });

  it('describes multi-channel and server targets', () => {
    const multi = unwrap(
      buildRunConfig(input({ scope: 'specific', selectedChannelIds: [CHANNEL_A, CHANNEL_B] })),
    );
    expect(describeTarget(multi)).toContain('2 channels');
    const server = unwrap(buildRunConfig(input({ scope: 'server' })));
    expect(describeTarget(server)).toContain(GUILD);
    expect(describeTarget(server)).toMatch(/^Every channel in server /);
  });

  it('names a channel when the caller knows its name', () => {
    const config = unwrap(buildRunConfig(input()));
    expect(describeTarget(config)).toBe(`Channel ${CHANNEL_A}`);
    expect(describeTarget(config, () => 'general')).toBe('Channel #general');
    expect(describeTarget(config, () => '  ')).toBe(`Channel ${CHANNEL_A}`);
  });

  it('names every channel of a multi-channel target it can', () => {
    const multi = unwrap(
      buildRunConfig(input({ scope: 'specific', selectedChannelIds: [CHANNEL_A, CHANNEL_B] })),
    );
    const named = describeTarget(multi, (id) => (id === CHANNEL_A ? 'general' : undefined));
    expect(named).toBe(`2 channels: #general, ${CHANNEL_B}`);
  });

  it('calls a DM a DM', () => {
    const dm = unwrap(buildRunConfig(input({ scope: 'dm' })));
    expect(describeTarget(dm)).toBe(`DM ${CHANNEL_A}`);
  });

  it('describes the all-time and before-only ranges', () => {
    const all = unwrap(buildRunConfig(input()));
    expect(describeTimeRange(all)).toBe('All time');
    const before = unwrap(buildRunConfig(input({ before: new Date(2024, 5, 1) })));
    expect(describeTimeRange(before)).toMatch(/^Before /);
  });
});

describe('describeRangePhrase', () => {
  it('reads as "all time" when nothing bounds the run', () => {
    expect(describeRangePhrase(unwrap(buildRunConfig(input())))).toBe('all time');
  });

  it('prefers the chosen preset over the instants it resolved to', () => {
    const config = unwrap(
      buildRunConfig(input({ after: new Date(2024, 0, 2), timeRangeLabel: 'Last 24 hours' })),
    );
    expect(describeRangePhrase(config)).toBe('Last 24 hours');
  });

  it('falls back to the dates for a hand-entered range', () => {
    const config = unwrap(
      buildRunConfig(input({ after: new Date(2024, 0, 2, 3, 4), timeRangeLabel: 'Custom range' })),
    );
    expect(describeRangePhrase(config)).toMatch(/^After /);
  });
});

describe('engineOptionsFor', () => {
  it('carries filters and dates through to the engine', () => {
    const after = new Date('2024-01-01T00:00:00Z');
    const config = unwrap(
      buildRunConfig(input({ after, content: 'oops', hasFile: true, pattern: '^gg$' })),
    );
    const options = engineOptionsFor(config, CHANNEL_B, 'token-1');
    expect(options.channelId).toBe(CHANNEL_B);
    expect(options.authToken).toBe('token-1');
    expect(options.authorId).toBe('author-1');
    expect(options.content).toBe('oops');
    expect(options.hasFile).toBe(true);
    expect(options.pattern).toBe('^gg$');
    expect(options.minId).toBeDefined();
    expect(options.guildId).toBeUndefined();
  });

  it('only sets guildId for the server scope', () => {
    const server = unwrap(buildRunConfig(input({ scope: 'server' })));
    expect(engineOptionsFor(server, CHANNEL_A, 't').guildId).toBe(GUILD);
  });

  it('bounds the run at the instant the config was built', () => {
    const captured = new Date('2024-07-01T12:00:00Z');
    const config = unwrap(buildRunConfig(input({ newestAllowed: captured })));
    expect(engineOptionsFor(config, CHANNEL_A, 't').maxId).toBe(dateToSnowflake(captured));
  });

  it('takes the earlier of the "before" filter and the capture instant', () => {
    const captured = new Date('2024-07-01T12:00:00Z');
    const before = new Date('2024-01-01T00:00:00Z');
    const earlier = unwrap(buildRunConfig(input({ before, newestAllowed: captured })));
    expect(engineOptionsFor(earlier, CHANNEL_A, 't').maxId).toBe(dateToSnowflake(before));
    expect(newestBoundary(earlier)).toEqual(before);

    const later = unwrap(
      buildRunConfig(input({ before: new Date('2025-01-01T00:00:00Z'), newestAllowed: captured })),
    );
    expect(engineOptionsFor(later, CHANNEL_A, 't').maxId).toBe(dateToSnowflake(captured));
    expect(snowflakeToDate(engineOptionsFor(later, CHANNEL_A, 't').maxId as string)).toEqual(
      captured,
    );
  });
});
