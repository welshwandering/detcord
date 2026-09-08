/**
 * Tests for the Discord API client.
 *
 * The client's contract is "every failure throws a DiscordApiError"; these
 * tests pin that contract down, including the rate limit and archived-thread
 * detail the deletion engine branches on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordApiClient, type SearchResponse } from './discord-api';
import { DISCORD_ERROR_THREAD_ARCHIVED, DiscordApiError } from './errors';

/** Builds a minimal stand-in for `Response` with real `Headers`. */
function makeResponse(options: {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  bodyThrows?: boolean;
}): Response {
  const { status, body, headers = {}, bodyThrows = false } = options;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: new Headers(headers),
    json: async () => {
      if (bodyThrows) {
        throw new SyntaxError('Unexpected end of JSON input');
      }
      return body;
    },
  } as unknown as Response;
}

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('DiscordApiClient', () => {
  // Valid mock token format: base64userId.timestamp.hmac (50-100 chars, 3 dot-separated parts)
  const TEST_TOKEN = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.XYZabc.abcdefghijklmnopqrstuvwxyz1';

  const TEST_GUILD_ID = '123456789012345678';
  const TEST_CHANNEL_ID = '234567890123456789';
  const TEST_MESSAGE_ID = '345678901234567890';
  const TEST_AUTHOR_ID = '456789012345678901';

  let client: DiscordApiClient;

  beforeEach(() => {
    client = new DiscordApiClient(TEST_TOKEN);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /** Resolves the URL passed to the nth (0-based) fetch call. */
  function urlOfCall(index = 0): string {
    return mockFetch.mock.calls[index]?.[0] as string;
  }

  /** Runs an operation and returns the DiscordApiError it threw. */
  async function captureError(run: () => Promise<unknown>): Promise<DiscordApiError> {
    try {
      await run();
    } catch (err) {
      if (DiscordApiError.is(err)) {
        return err;
      }
      throw err;
    }
    throw new Error('Expected a DiscordApiError to be thrown');
  }

  describe('constructor', () => {
    it('should create client with valid token', () => {
      expect(new DiscordApiClient(TEST_TOKEN)).toBeInstanceOf(DiscordApiClient);
    });

    it('should throw error for invalid token format', () => {
      expect(() => new DiscordApiClient('invalid-token')).toThrow('Token has invalid format');
    });

    it('should throw error for empty token', () => {
      expect(() => new DiscordApiClient('')).toThrow('Token is required');
    });

    it('should throw error for null token', () => {
      expect(() => new DiscordApiClient(null as unknown as string)).toThrow('Token is required');
    });

    it('should throw error for undefined token', () => {
      expect(() => new DiscordApiClient(undefined as unknown as string)).toThrow(
        'Token is required',
      );
    });
  });

  describe('request headers', () => {
    it('should send the token and no Content-Type on GET', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 200, body: { messages: [], total_results: 0 } }),
      );

      await client.searchMessages({ guildId: TEST_GUILD_ID });

      const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
      expect(init.method).toBe('GET');
      expect(init.headers).toEqual({ Authorization: TEST_TOKEN });
      expect(init.headers).not.toHaveProperty('Content-Type');
    });

    it('should send no Content-Type on DELETE', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 204 }));

      await client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID);

      const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
      expect(init.method).toBe('DELETE');
      expect(init.headers).toEqual({ Authorization: TEST_TOKEN });
    });

    it('should omit the signal when the caller supplies none', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 204 }));

      await client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID);

      const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
      expect(init.signal).toBeUndefined();
    });
  });

  describe('cancellation', () => {
    /** The rejection a real `fetch` produces for a cancelled request. */
    function abortError(): DOMException {
      return new DOMException('The user aborted a request.', 'AbortError');
    }

    /** Stubs `fetch` with the abort behaviour a real implementation has. */
    function stubAbortableFetch(): void {
      mockFetch.mockImplementation((_url: string, init: RequestInit) => {
        const signal = init.signal ?? undefined;
        if (signal?.aborted) {
          return Promise.reject(abortError());
        }
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(abortError()), { once: true });
        });
      });
    }

    /** One request per method, each with the response its success path needs. */
    const requests: Array<{
      name: string;
      response: () => Response;
      run: (client: DiscordApiClient, signal?: AbortSignal) => Promise<unknown>;
    }> = [
      {
        name: 'searchMessages',
        response: () => makeResponse({ status: 200, body: { messages: [], total_results: 0 } }),
        run: (target, signal) => target.searchMessages({ guildId: TEST_GUILD_ID }, signal),
      },
      {
        name: 'deleteMessage',
        response: () => makeResponse({ status: 204 }),
        run: (target, signal) => target.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID, signal),
      },
      {
        name: 'getCurrentUser',
        response: () => makeResponse({ status: 200, body: { id: TEST_AUTHOR_ID } }),
        run: (target, signal) => target.getCurrentUser(signal),
      },
      {
        name: 'getGuildChannels',
        response: () => makeResponse({ status: 200, body: [] }),
        run: (target, signal) => target.getGuildChannels(TEST_GUILD_ID, signal),
      },
    ];

    it.each(requests.map((request) => [request.name, request] as const))(
      'should forward the caller signal to fetch from %s',
      async (_name, request) => {
        mockFetch.mockResolvedValueOnce(request.response());
        const controller = new AbortController();

        await request.run(client, controller.signal);

        const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
        expect(init.signal).toBe(controller.signal);
      },
    );

    it.each(requests.map((request) => [request.name, request] as const))(
      'should throw ABORTED from %s when the signal has already fired',
      async (_name, request) => {
        stubAbortableFetch();
        const controller = new AbortController();
        controller.abort();

        const error = await captureError(() => request.run(client, controller.signal));

        expect(error.code).toBe('ABORTED');
        expect(error.message).toBe('Request aborted');
        expect(error.isRetryable).toBe(false);
      },
    );

    it('should throw ABORTED when the signal fires mid-flight', async () => {
      stubAbortableFetch();
      const controller = new AbortController();

      const pending = captureError(() =>
        client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID, controller.signal),
      );
      controller.abort();
      const error = await pending;

      expect(error.code).toBe('ABORTED');
      expect(error.isRetryable).toBe(false);
      expect(error.cause).toBeInstanceOf(DOMException);
    });

    it('should treat a rejection racing the abort as ABORTED', async () => {
      const controller = new AbortController();
      mockFetch.mockImplementationOnce(() => {
        controller.abort();
        return Promise.reject(new TypeError('Failed to fetch'));
      });

      const error = await captureError(() =>
        client.searchMessages({ guildId: TEST_GUILD_ID }, controller.signal),
      );

      expect(error.code).toBe('ABORTED');
    });

    it('should still throw NETWORK_ERROR when a live signal is attached', async () => {
      const controller = new AbortController();
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const error = await captureError(() =>
        client.searchMessages({ guildId: TEST_GUILD_ID }, controller.signal),
      );

      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.isRetryable).toBe(true);
      expect(controller.signal.aborted).toBe(false);
    });
  });

  describe('getRateLimitInfo', () => {
    it('should return null before any requests', () => {
      expect(client.getRateLimitInfo()).toBeNull();
    });

    it('should record remaining, limit and reset from headers', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: { messages: [], total_results: 0 },
          headers: {
            'X-RateLimit-Remaining': '4',
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Reset-After': '1.5',
          },
        }),
      );

      await client.searchMessages({ guildId: TEST_GUILD_ID });

      expect(client.getRateLimitInfo()).toEqual({ remaining: 4, limit: 5, resetAfter: 1.5 });
    });

    it('should record the rate limit bucket when present', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: { messages: [], total_results: 0 },
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Reset-After': '2',
            'X-RateLimit-Bucket': 'abcd1234',
          },
        }),
      );

      await client.searchMessages({ guildId: TEST_GUILD_ID });

      expect(client.getRateLimitInfo()?.bucket).toBe('abcd1234');
    });

    it('should flag a global rate limit from headers', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: { messages: [], total_results: 0 },
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Reset-After': '3',
            'X-RateLimit-Global': 'true',
          },
        }),
      );

      await client.searchMessages({ guildId: TEST_GUILD_ID });

      expect(client.getRateLimitInfo()?.global).toBe(true);
    });

    it('should ignore unparsable header values', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: { messages: [], total_results: 0 },
          headers: {
            'X-RateLimit-Remaining': 'not-a-number',
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Reset-After': '1',
          },
        }),
      );

      await client.searchMessages({ guildId: TEST_GUILD_ID });

      expect(client.getRateLimitInfo()).toBeNull();
    });

    it('should leave rate limit info untouched when headers are missing', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 200, body: { messages: [], total_results: 0 } }),
      );

      await client.searchMessages({ guildId: TEST_GUILD_ID });

      expect(client.getRateLimitInfo()).toBeNull();
    });

    it('should accept fractional reset values', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: { messages: [], total_results: 0 },
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Reset-After': '0.064',
          },
        }),
      );

      await client.searchMessages({ guildId: TEST_GUILD_ID });

      expect(client.getRateLimitInfo()?.resetAfter).toBeCloseTo(0.064);
    });
  });

  describe('searchMessages', () => {
    const mockSearchResponse: SearchResponse = {
      messages: [
        [
          {
            id: '111',
            channel_id: '222',
            author: { id: '333', username: 'testuser', discriminator: '0001', avatar: null },
            content: 'Hello world',
            timestamp: '2024-01-01T00:00:00.000Z',
            attachments: [],
            embeds: [],
            pinned: false,
            type: 0,
            hit: true,
          },
        ],
      ],
      total_results: 1,
    };

    it('should search messages in a guild', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 200, body: mockSearchResponse }));

      const result = await client.searchMessages({ guildId: TEST_GUILD_ID });

      expect(urlOfCall()).toBe(
        `https://discord.com/api/v10/guilds/${TEST_GUILD_ID}/messages/search`,
      );
      expect(result).toEqual(mockSearchResponse);
    });

    it('should search messages in a channel (for DMs)', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 200, body: mockSearchResponse }));

      const result = await client.searchMessages({ channelId: TEST_CHANNEL_ID });

      expect(urlOfCall()).toBe(
        `https://discord.com/api/v10/channels/${TEST_CHANNEL_ID}/messages/search`,
      );
      expect(result).toEqual(mockSearchResponse);
    });

    it('should include author_id, content, min_id and max_id in query params', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 200, body: { messages: [], total_results: 0 } }),
      );

      await client.searchMessages({
        guildId: TEST_GUILD_ID,
        authorId: TEST_AUTHOR_ID,
        content: 'test search',
        minId: '100000000000000000',
        maxId: '999999999999999999',
      });

      const url = urlOfCall();
      expect(url).toContain(`author_id=${TEST_AUTHOR_ID}`);
      expect(url).toContain('content=test+search');
      expect(url).toContain('min_id=100000000000000000');
      expect(url).toContain('max_id=999999999999999999');
    });

    it('should append has=link and has=file as separate params', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 200, body: { messages: [], total_results: 0 } }),
      );

      await client.searchMessages({ guildId: TEST_GUILD_ID, hasLink: true, hasFile: true });

      const query = new URLSearchParams(urlOfCall().split('?')[1] ?? '');
      expect(query.getAll('has')).toEqual(['link', 'file']);
    });

    it('should append every entry of params.has', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 200, body: { messages: [], total_results: 0 } }),
      );

      await client.searchMessages({ guildId: TEST_GUILD_ID, has: ['image', 'video', 'sticker'] });

      const query = new URLSearchParams(urlOfCall().split('?')[1] ?? '');
      expect(query.getAll('has')).toEqual(['image', 'video', 'sticker']);
    });

    it('should not repeat a has value requested twice', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 200, body: { messages: [], total_results: 0 } }),
      );

      await client.searchMessages({ guildId: TEST_GUILD_ID, hasLink: true, has: ['link'] });

      const query = new URLSearchParams(urlOfCall().split('?')[1] ?? '');
      expect(query.getAll('has')).toEqual(['link']);
    });

    it('should include offset when greater than zero and omit it otherwise', async () => {
      mockFetch.mockResolvedValue(
        makeResponse({ status: 200, body: { messages: [], total_results: 0 } }),
      );

      await client.searchMessages({ guildId: TEST_GUILD_ID, offset: 25 });
      await client.searchMessages({ guildId: TEST_GUILD_ID, offset: 0 });

      expect(urlOfCall(0)).toContain('offset=25');
      expect(urlOfCall(1)).not.toContain('offset');
    });

    it('should include include_nsfw when true', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 200, body: { messages: [], total_results: 0 } }),
      );

      await client.searchMessages({ guildId: TEST_GUILD_ID, includeNsfw: true });

      expect(urlOfCall()).toContain('include_nsfw=true');
    });

    it('should throw UNKNOWN when neither guildId nor channelId provided', async () => {
      const error = await captureError(() => client.searchMessages({}));

      expect(error.code).toBe('UNKNOWN');
      expect(error.message).toBe('Either guildId or channelId is required for search');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw UNKNOWN for an invalid guild ID', async () => {
      const error = await captureError(() => client.searchMessages({ guildId: 'invalid' }));

      expect(error.code).toBe('UNKNOWN');
      expect(error.message).toBe('Invalid guild ID format');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw UNKNOWN for an invalid channel ID', async () => {
      const error = await captureError(() => client.searchMessages({ channelId: 'invalid' }));

      expect(error.code).toBe('UNKNOWN');
      expect(error.message).toBe('Invalid channel ID format');
    });

    it('should accept @me as guild ID for DMs', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 200, body: { messages: [], total_results: 0 } }),
      );

      await expect(
        client.searchMessages({ guildId: '@me', channelId: TEST_CHANNEL_ID }),
      ).resolves.toBeDefined();
    });

    it('should throw INDEXING for a 202 response', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 202, bodyThrows: true }));

      const error = await captureError(() => client.searchMessages({ guildId: TEST_GUILD_ID }));

      expect(error.code).toBe('INDEXING');
      expect(error.httpStatus).toBe(202);
      expect(error.message).toBe('Search index is being built, try again later');
      expect(error.isRetryable).toBe(true);
    });

    it('should carry retry_after from a 202 body when Discord supplies one', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 202, body: { retry_after: 3, message: 'Index not ready' } }),
      );

      const error = await captureError(() => client.searchMessages({ guildId: TEST_GUILD_ID }));

      expect(error.code).toBe('INDEXING');
      expect(error.retryAfter).toBe(3);
      expect(error.message).toBe('Index not ready');
    });

    it('should throw UNAUTHORIZED for 401', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 401, body: { message: 'Invalid token', code: 0 } }),
      );

      const error = await captureError(() => client.searchMessages({ guildId: TEST_GUILD_ID }));

      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Invalid token');
      expect(error.httpStatus).toBe(401);
      expect(error.isRetryable).toBe(false);
    });

    it('should throw SERVER_ERROR for 500', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 500, bodyThrows: true }));

      const error = await captureError(() => client.searchMessages({ guildId: TEST_GUILD_ID }));

      expect(error.code).toBe('SERVER_ERROR');
      expect(error.message).toBe('HTTP 500');
      expect(error.isRetryable).toBe(true);
    });

    it('should throw RATE_LIMITED with retry_after from the body', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          status: 429,
          body: { message: 'You are being rate limited.', retry_after: 2.5, global: false },
        }),
      );

      const error = await captureError(() => client.searchMessages({ guildId: TEST_GUILD_ID }));

      expect(error.code).toBe('RATE_LIMITED');
      expect(error.retryAfter).toBe(2.5);
      expect(error.global).toBe(false);
      expect(error.httpStatus).toBe(429);
    });

    it('should throw NETWORK_ERROR when fetch rejects, preserving the cause', async () => {
      const cause = new TypeError('Failed to fetch');
      mockFetch.mockRejectedValueOnce(cause);

      const error = await captureError(() => client.searchMessages({ guildId: TEST_GUILD_ID }));

      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe('Failed to fetch');
      expect(error.cause).toBe(cause);
      expect(error.isRetryable).toBe(true);
    });

    it('should describe a non-Error fetch rejection', async () => {
      mockFetch.mockRejectedValueOnce('boom');

      const error = await captureError(() => client.searchMessages({ guildId: TEST_GUILD_ID }));

      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe('Network request failed');
    });

    it('should throw NETWORK_ERROR for a truncated success body', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 200, bodyThrows: true }));

      const error = await captureError(() => client.searchMessages({ guildId: TEST_GUILD_ID }));

      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe("Could not read Discord's response");
      expect(error.httpStatus).toBe(200);
      expect(error.isRetryable).toBe(true);
    });

    it('should throw NETWORK_ERROR when the body stream fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: '',
        headers: new Headers(),
        json: async () => {
          throw new TypeError('network error');
        },
      } as unknown as Response);

      const error = await captureError(() => client.searchMessages({ guildId: TEST_GUILD_ID }));

      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.cause).toBeInstanceOf(TypeError);
    });

    it.each([
      ['messages is not an array', { messages: {}, total_results: 3 }],
      ['total_results is missing', { messages: [] }],
      ['total_results is not numeric', { messages: [], total_results: '3' }],
      ['the payload is null', null],
    ])('should throw UNKNOWN when %s', async (_label, body) => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 200, body }));

      const error = await captureError(() => client.searchMessages({ guildId: TEST_GUILD_ID }));

      expect(error.code).toBe('UNKNOWN');
      expect(error.message).toBe('Unexpected response shape');
      expect(error.httpStatus).toBe(200);
    });
  });

  describe('deleteMessage', () => {
    it('should return "deleted" for a 204 response', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 204 }));

      await expect(client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID)).resolves.toBe('deleted');
      expect(urlOfCall()).toBe(
        `https://discord.com/api/v10/channels/${TEST_CHANNEL_ID}/messages/${TEST_MESSAGE_ID}`,
      );
    });

    it('should return "already_gone" for a 404 response', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 404, body: { message: 'Unknown Message', code: 10008 } }),
      );

      await expect(client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID)).resolves.toBe(
        'already_gone',
      );
    });

    it('should throw RATE_LIMITED with body retry_after and global flag', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          status: 429,
          body: { message: 'You are being rate limited.', retry_after: 3.5, global: true },
          headers: {
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Reset-After': '1.0',
          },
        }),
      );

      const error = await captureError(() =>
        client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID),
      );

      expect(error.code).toBe('RATE_LIMITED');
      expect(error.retryAfter).toBe(3.5);
      expect(error.global).toBe(true);
    });

    it('should fall back to X-RateLimit-Reset-After when the body has no retry_after', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          status: 429,
          body: {},
          headers: { 'X-RateLimit-Reset-After': '2.75' },
        }),
      );

      const error = await captureError(() =>
        client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID),
      );

      expect(error.retryAfter).toBe(2.75);
    });

    it('should fall back to Retry-After when no rate limit header is present', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 429, bodyThrows: true, headers: { 'Retry-After': '7' } }),
      );

      const error = await captureError(() =>
        client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID),
      );

      expect(error.retryAfter).toBe(7);
      expect(error.message).toBe('HTTP 429');
    });

    it('should detect a global rate limit from the X-RateLimit-Scope header', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 429, body: {}, headers: { 'X-RateLimit-Scope': 'global' } }),
      );

      const error = await captureError(() =>
        client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID),
      );

      expect(error.global).toBe(true);
    });

    it('should surface an archived thread 403 as isArchivedThread', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          status: 403,
          body: { message: 'Thread is archived', code: DISCORD_ERROR_THREAD_ARCHIVED },
        }),
      );

      const error = await captureError(() =>
        client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID),
      );

      expect(error.code).toBe('FORBIDDEN');
      expect(error.discordCode).toBe(50083);
      expect(error.isArchivedThread).toBe(true);
      expect(error.isRetryable).toBe(false);
    });

    it('should surface an ordinary 403 as FORBIDDEN without the archived flag', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 403, body: { message: 'Missing Permissions', code: 50013 } }),
      );

      const error = await captureError(() =>
        client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID),
      );

      expect(error.code).toBe('FORBIDDEN');
      expect(error.isArchivedThread).toBe(false);
    });

    it('should throw SERVER_ERROR for 500', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 500, body: {} }));

      const error = await captureError(() =>
        client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID),
      );

      expect(error.code).toBe('SERVER_ERROR');
      expect(error.httpStatus).toBe(500);
    });

    it('should throw NETWORK_ERROR when fetch rejects', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection reset'));

      const error = await captureError(() =>
        client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID),
      );

      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe('Connection reset');
    });

    it('should throw UNKNOWN without calling fetch for missing IDs', async () => {
      const missingChannel = await captureError(() => client.deleteMessage('', TEST_MESSAGE_ID));
      const missingMessage = await captureError(() => client.deleteMessage(TEST_CHANNEL_ID, ''));

      expect(missingChannel.code).toBe('UNKNOWN');
      expect(missingChannel.message).toBe('channelId and messageId are required');
      expect(missingMessage.message).toBe('channelId and messageId are required');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw UNKNOWN without calling fetch for malformed IDs', async () => {
      const badChannel = await captureError(() => client.deleteMessage('invalid', TEST_MESSAGE_ID));
      const badMessage = await captureError(() => client.deleteMessage(TEST_CHANNEL_ID, 'invalid'));

      expect(badChannel.message).toBe('Invalid channel ID format');
      expect(badMessage.message).toBe('Invalid message ID format');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentUser', () => {
    it('should return the authenticated account', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: { id: TEST_AUTHOR_ID, username: 'someone', global_name: 'Someone' },
        }),
      );

      const user = await client.getCurrentUser();

      expect(urlOfCall()).toBe('https://discord.com/api/v10/users/@me');
      expect(user).toEqual({ id: TEST_AUTHOR_ID, username: 'someone', globalName: 'Someone' });
    });

    it('should map a null global_name to null', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: { id: TEST_AUTHOR_ID, username: 'someone', global_name: null },
        }),
      );

      await expect(client.getCurrentUser()).resolves.toMatchObject({ globalName: null });
    });

    it('should throw UNAUTHORIZED for an invalid token', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 401, body: { message: '401: Unauthorized', code: 0 } }),
      );

      const error = await captureError(() => client.getCurrentUser());

      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.httpStatus).toBe(401);
    });

    it('should throw UNKNOWN when the payload has no id', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 200, body: { username: 'someone' } }));

      const error = await captureError(() => client.getCurrentUser());

      expect(error.code).toBe('UNKNOWN');
      expect(error.message).toBe('Unexpected response shape');
    });

    it('should throw NETWORK_ERROR when the body cannot be parsed', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 200, bodyThrows: true }));

      const error = await captureError(() => client.getCurrentUser());

      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe("Could not read Discord's response");
      expect(error.httpStatus).toBe(200);
      expect(error.cause).toBeInstanceOf(SyntaxError);
    });

    it('should throw UNKNOWN when the payload is not an object', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 200, body: 'nope' }));

      expect((await captureError(() => client.getCurrentUser())).code).toBe('UNKNOWN');
    });
  });

  describe('getGuildChannels', () => {
    it('should return only text-capable channels', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({
          status: 200,
          body: [
            { id: '1', type: 0, name: 'general' },
            { id: '2', type: 2, name: 'voice' },
            { id: '3', type: 11, name: 'thread' },
            { id: '4', type: 4, name: 'category' },
          ],
        }),
      );

      const channels = await client.getGuildChannels(TEST_GUILD_ID);

      expect(channels.map((channel) => channel.id)).toEqual(['1', '3']);
    });

    it('should throw UNKNOWN for a missing guild ID', async () => {
      const error = await captureError(() => client.getGuildChannels(''));

      expect(error.code).toBe('UNKNOWN');
      expect(error.message).toBe('guildId is required');
    });

    it('should throw UNKNOWN for a malformed guild ID', async () => {
      const error = await captureError(() => client.getGuildChannels('@me'));

      expect(error.message).toBe('Invalid guild ID format');
    });

    it('should throw FORBIDDEN when the guild is not accessible', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 403, body: { message: 'Missing Access', code: 50001 } }),
      );

      const error = await captureError(() => client.getGuildChannels(TEST_GUILD_ID));

      expect(error.code).toBe('FORBIDDEN');
      expect(error.discordCode).toBe(50001);
    });

    it('should throw NETWORK_ERROR when the channel list cannot be read', async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ status: 200, bodyThrows: true }));

      const error = await captureError(() => client.getGuildChannels(TEST_GUILD_ID));

      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe("Could not read Discord's response");
    });

    it('should throw UNKNOWN when the channel list is not an array', async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ status: 200, body: { channels: [{ id: '1', type: 0 }] } }),
      );

      const error = await captureError(() => client.getGuildChannels(TEST_GUILD_ID));

      expect(error.code).toBe('UNKNOWN');
      expect(error.message).toBe('Unexpected response shape');
    });
  });
});
