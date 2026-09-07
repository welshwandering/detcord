/**
 * Sequence-level tests for the Discord API client.
 *
 * The unit tests pin one response at a time; these drive the client through
 * the request sequences the deletion engine actually produces, so a regression
 * in how errors and rate limit state compose across calls is caught here.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type DeleteOutcome, DiscordApiClient } from './discord-api';
import { DiscordApiError } from './errors';

const TEST_TOKEN = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.XYZabc.abcdefghijklmnopqrstuvwxyz1';
const GUILD_ID = '123456789012345678';
const CHANNEL_ID = '234567890123456789';

/** A scripted response for the fake transport. */
interface ScriptedResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Queues responses to be returned by `fetch` in order. */
function script(...responses: ScriptedResponse[]): void {
  for (const { status, body, headers = {} } of responses) {
    mockFetch.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      statusText: '',
      headers: new Headers(headers),
      json: async () => {
        if (body === undefined) {
          throw new SyntaxError('Unexpected end of JSON input');
        }
        return body;
      },
    } as unknown as Response);
  }
}

/** Builds a search payload containing `count` hits in one context group. */
function searchPayload(count: number, total = count): unknown {
  return {
    total_results: total,
    messages: [
      Array.from({ length: count }, (_, index) => ({
        id: `${345678901234567890n + BigInt(index)}`,
        channel_id: CHANNEL_ID,
        author: { id: '1', username: 'me', discriminator: '0', avatar: null },
        content: `message ${index}`,
        timestamp: '2024-01-01T00:00:00.000Z',
        attachments: [],
        embeds: [],
        pinned: false,
        type: 0,
        hit: true,
      })),
    ],
  };
}

describe('DiscordApiClient sequences', () => {
  let client: DiscordApiClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new DiscordApiClient(TEST_TOKEN);
  });

  it('should surface a throttled delete as a retryable error, then succeed on retry', async () => {
    script(
      { status: 429, body: { retry_after: 1.25 }, headers: { 'X-RateLimit-Remaining': '0' } },
      { status: 204, headers: { 'X-RateLimit-Remaining': '4' } },
    );

    const outcomes: DeleteOutcome[] = [];
    let observedRetryAfter: number | undefined;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        outcomes.push(await client.deleteMessage(CHANNEL_ID, '345678901234567890'));
      } catch (err) {
        expect(DiscordApiError.is(err)).toBe(true);
        const error = err as DiscordApiError;
        expect(error.code).toBe('RATE_LIMITED');
        expect(error.isRetryable).toBe(true);
        observedRetryAfter = error.retryAfter;
      }
    }

    // The old client returned `{ success: false }` here, so a throttled delete
    // was recorded as a permanent failure and the wait was never honoured.
    expect(observedRetryAfter).toBe(1.25);
    expect(outcomes).toEqual(['deleted']);
  });

  it('should page through a search and delete each hit', async () => {
    script(
      { status: 200, body: searchPayload(2, 3) },
      { status: 204 },
      { status: 404, body: { message: 'Unknown Message', code: 10008 } },
      { status: 200, body: searchPayload(1, 3) },
      { status: 204 },
    );

    const first = await client.searchMessages({ guildId: GUILD_ID, channelId: CHANNEL_ID });
    const firstOutcomes: DeleteOutcome[] = [];
    for (const message of first.messages.flat()) {
      firstOutcomes.push(await client.deleteMessage(message.channel_id, message.id));
    }

    const second = await client.searchMessages({
      guildId: GUILD_ID,
      channelId: CHANNEL_ID,
      offset: 2,
    });
    const secondOutcomes: DeleteOutcome[] = [];
    for (const message of second.messages.flat()) {
      secondOutcomes.push(await client.deleteMessage(message.channel_id, message.id));
    }

    expect(first.total_results).toBe(3);
    expect(firstOutcomes).toEqual(['deleted', 'already_gone']);
    expect(secondOutcomes).toEqual(['deleted']);
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('should keep rate limit state from the most recent response', async () => {
    script(
      {
        status: 200,
        body: searchPayload(0, 0),
        headers: {
          'X-RateLimit-Remaining': '4',
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Reset-After': '5',
          'X-RateLimit-Bucket': 'search-bucket',
        },
      },
      {
        status: 204,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Limit': '3',
          'X-RateLimit-Reset-After': '0.75',
          'X-RateLimit-Bucket': 'delete-bucket',
        },
      },
    );

    await client.searchMessages({ guildId: GUILD_ID });
    expect(client.getRateLimitInfo()).toMatchObject({ remaining: 4, bucket: 'search-bucket' });

    await client.deleteMessage(CHANNEL_ID, '345678901234567890');
    expect(client.getRateLimitInfo()).toMatchObject({
      remaining: 0,
      limit: 3,
      resetAfter: 0.75,
      bucket: 'delete-bucket',
    });
  });

  it('should report an indexing search and then return results once ready', async () => {
    script({ status: 202 }, { status: 200, body: searchPayload(1) });

    await expect(client.searchMessages({ guildId: GUILD_ID })).rejects.toMatchObject({
      code: 'INDEXING',
    });
    await expect(client.searchMessages({ guildId: GUILD_ID })).resolves.toMatchObject({
      total_results: 1,
    });
  });

  it('should bind a token to an account before any deletion happens', async () => {
    script(
      { status: 200, body: { id: '456789012345678901', username: 'me', global_name: null } },
      { status: 200, body: searchPayload(1) },
    );

    const user = await client.getCurrentUser();
    const results = await client.searchMessages({
      guildId: GUILD_ID,
      authorId: user.id,
    });

    expect(mockFetch.mock.calls[1]?.[0]).toContain('author_id=456789012345678901');
    expect(results.total_results).toBe(1);
  });

  it('should classify an archived thread separately from a permissions failure', async () => {
    script(
      { status: 403, body: { message: 'Thread is archived', code: 50083 } },
      { status: 403, body: { message: 'Missing Permissions', code: 50013 } },
    );

    const errors: DiscordApiError[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await client.deleteMessage(CHANNEL_ID, '345678901234567890').catch((err: unknown) => {
        errors.push(err as DiscordApiError);
      });
    }

    expect(errors.map((error) => error.isArchivedThread)).toEqual([true, false]);
  });
});
