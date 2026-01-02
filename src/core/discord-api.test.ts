/**
 * Tests for Discord API Client
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DiscordApiClient, type SearchResponse } from './discord-api';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('DiscordApiClient', () => {
  // Valid mock token format: base64userId.timestamp.hmac (50-100 chars, 3 dot-separated parts)
  const TEST_TOKEN = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.XYZabc.abcdefghijklmnopqrstuvwxyz1';

  // Valid snowflake IDs (17-19 digits) for testing
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

  describe('constructor', () => {
    it('should create client with valid token', () => {
      const validToken = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.XYZabc.abcdefghijklmnopqrstuvwxyz1';
      const newClient = new DiscordApiClient(validToken);
      expect(newClient).toBeInstanceOf(DiscordApiClient);
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

  describe('getRateLimitInfo', () => {
    it('should return null before any requests', () => {
      expect(client.getRateLimitInfo()).toBeNull();
    });

    it('should return rate limit info after request with headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-RateLimit-Remaining': '4',
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Reset-After': '1.5',
        }),
        json: async () => ({ messages: [], total_results: 0 }),
      });

      await client.searchMessages({ guildId: TEST_GUILD_ID });

      const info = client.getRateLimitInfo();
      expect(info).toEqual({
        remaining: 4,
        limit: 5,
        resetAfter: 1.5,
      });
    });
  });

  describe('searchMessages', () => {
    const mockSearchResponse: SearchResponse = {
      messages: [
        [
          {
            id: '111',
            channel_id: '222',
            author: {
              id: '333',
              username: 'testuser',
              discriminator: '0001',
              avatar: null,
            },
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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockSearchResponse,
      });

      const result = await client.searchMessages({ guildId: TEST_GUILD_ID });

      expect(mockFetch).toHaveBeenCalledWith(
        `https://discord.com/api/v10/guilds/${TEST_GUILD_ID}/messages/search`,
        expect.objectContaining({
          method: 'GET',
          headers: {
            Authorization: TEST_TOKEN,
            'Content-Type': 'application/json',
          },
        }),
      );
      expect(result).toEqual(mockSearchResponse);
    });

    it('should search messages in a channel (for DMs)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => mockSearchResponse,
      });

      const result = await client.searchMessages({ channelId: TEST_CHANNEL_ID });

      expect(mockFetch).toHaveBeenCalledWith(
        `https://discord.com/api/v10/channels/${TEST_CHANNEL_ID}/messages/search`,
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(result).toEqual(mockSearchResponse);
    });

    it('should include author_id in query params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ messages: [], total_results: 0 }),
      });

      await client.searchMessages({
        guildId: TEST_GUILD_ID,
        authorId: TEST_AUTHOR_ID,
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain(`author_id=${TEST_AUTHOR_ID}`);
    });

    it('should include content in query params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ messages: [], total_results: 0 }),
      });

      await client.searchMessages({
        guildId: TEST_GUILD_ID,
        content: 'test search',
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('content=test+search');
    });

    it('should include min_id and max_id in query params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ messages: [], total_results: 0 }),
      });

      const minId = '100000000000000000';
      const maxId = '999999999999999999';
      await client.searchMessages({
        guildId: TEST_GUILD_ID,
        minId,
        maxId,
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain(`min_id=${minId}`);
      expect(calledUrl).toContain(`max_id=${maxId}`);
    });

    it('should include has=link when hasLink is true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ messages: [], total_results: 0 }),
      });

      await client.searchMessages({
        guildId: TEST_GUILD_ID,
        hasLink: true,
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('has=link');
    });

    it('should include has=file when hasFile is true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ messages: [], total_results: 0 }),
      });

      await client.searchMessages({
        guildId: TEST_GUILD_ID,
        hasFile: true,
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('has=file');
    });

    it('should include offset in query params when > 0', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ messages: [], total_results: 0 }),
      });

      await client.searchMessages({
        guildId: TEST_GUILD_ID,
        offset: 25,
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('offset=25');
    });

    it('should not include offset when 0', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ messages: [], total_results: 0 }),
      });

      await client.searchMessages({
        guildId: TEST_GUILD_ID,
        offset: 0,
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).not.toContain('offset');
    });

    it('should include include_nsfw when true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ messages: [], total_results: 0 }),
      });

      await client.searchMessages({
        guildId: TEST_GUILD_ID,
        includeNsfw: true,
      });

      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain('include_nsfw=true');
    });

    it('should throw error when neither guildId nor channelId provided', async () => {
      await expect(client.searchMessages({})).rejects.toMatchObject({
        code: 'UNKNOWN',
        message: 'Either guildId or channelId is required for search',
      });
    });

    it('should handle 202 indexing response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 202,
        headers: new Headers(),
      });

      await expect(client.searchMessages({ guildId: TEST_GUILD_ID })).rejects.toMatchObject({
        code: 'INDEXING',
        message: 'Search index is being built, try again later',
      });
    });

    it('should handle 401 unauthorized response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ message: 'Invalid token' }),
      });

      await expect(client.searchMessages({ guildId: TEST_GUILD_ID })).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Invalid token',
        httpStatus: 401,
      });
    });

    it('should handle 403 forbidden response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Headers(),
        json: async () => ({ message: 'Missing access' }),
      });

      await expect(client.searchMessages({ guildId: TEST_GUILD_ID })).rejects.toMatchObject({
        code: 'FORBIDDEN',
        message: 'Missing access',
        httpStatus: 403,
      });
    });

    it('should handle 429 rate limit response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers(),
        json: async () => ({ message: 'Rate limited', retry_after: 2.5 }),
      });

      await expect(client.searchMessages({ guildId: TEST_GUILD_ID })).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        message: 'Rate limited',
        retryAfter: 2.5,
        httpStatus: 429,
      });
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network connection failed'));

      await expect(client.searchMessages({ guildId: TEST_GUILD_ID })).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        message: 'Network connection failed',
      });
    });
  });

  describe('deleteMessage', () => {
    it('should successfully delete a message (204 response)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers(),
      });

      const result = await client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://discord.com/api/v10/channels/${TEST_CHANNEL_ID}/messages/${TEST_MESSAGE_ID}`,
        expect.objectContaining({
          method: 'DELETE',
          headers: {
            Authorization: TEST_TOKEN,
            'Content-Type': 'application/json',
          },
        }),
      );
      expect(result).toEqual({ success: true });
    });

    it('should return error for missing channelId', async () => {
      const result = await client.deleteMessage('', TEST_MESSAGE_ID);

      expect(result).toEqual({
        success: false,
        error: 'channelId and messageId are required',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return error for missing messageId', async () => {
      const result = await client.deleteMessage(TEST_CHANNEL_ID, '');

      expect(result).toEqual({
        success: false,
        error: 'channelId and messageId are required',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return error for invalid channelId format', async () => {
      const result = await client.deleteMessage('invalid', TEST_MESSAGE_ID);

      expect(result).toEqual({
        success: false,
        error: 'Invalid channel ID format',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return error for invalid messageId format', async () => {
      const result = await client.deleteMessage(TEST_CHANNEL_ID, 'invalid');

      expect(result).toEqual({
        success: false,
        error: 'Invalid message ID format',
      });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle 202 indexing response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 202,
        headers: new Headers(),
      });

      const result = await client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID);

      expect(result).toEqual({
        success: false,
        indexing: true,
        error: 'Message indexing in progress',
      });
    });

    it('should handle 429 rate limit with retry_after', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Reset-After': '1.0',
        }),
        json: async () => ({ retry_after: 3.5 }),
      });

      const result = await client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID);

      expect(result).toEqual({
        success: false,
        error: 'Rate limited',
        retryAfter: 3.5,
      });
    });

    it('should use rate limit header when retry_after not in body', async () => {
      // First, make a request to populate rate limit info
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Reset-After': '2.0',
        }),
        json: async () => ({ messages: [], total_results: 0 }),
      });

      await client.searchMessages({ guildId: TEST_GUILD_ID });

      // Now simulate rate limit without retry_after in body
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Reset-After': '2.0',
        }),
        json: async () => ({}),
      });

      const result = await client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID);

      expect(result).toEqual({
        success: false,
        error: 'Rate limited',
        retryAfter: 2.0,
      });
    });

    it('should handle 404 not found response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: async () => ({ message: 'Unknown Message' }),
      });

      const result = await client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID);

      expect(result).toEqual({
        success: false,
        error: 'Unknown Message',
      });
    });

    it('should handle 403 forbidden response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Headers(),
        json: async () => ({ message: 'Cannot delete this message' }),
      });

      const result = await client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID);

      expect(result).toEqual({
        success: false,
        error: 'Cannot delete this message',
      });
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection reset'));

      const result = await client.deleteMessage(TEST_CHANNEL_ID, TEST_MESSAGE_ID);

      expect(result).toEqual({
        success: false,
        error: 'Connection reset',
      });
    });
  });

  describe('Authorization header', () => {
    it('should use token without Bot prefix', async () => {
      // Valid user token format (not a bot token)
      const tokenWithoutPrefix = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.XYZabc.abcdefghijklmnopqrstuvwxyz1';
      const testClient = new DiscordApiClient(tokenWithoutPrefix);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ messages: [], total_results: 0 }),
      });

      await testClient.searchMessages({ guildId: TEST_GUILD_ID });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            Authorization: tokenWithoutPrefix,
            'Content-Type': 'application/json',
          },
        }),
      );
    });
  });

  describe('input validation', () => {
    it('should reject invalid guild ID format in searchMessages', async () => {
      await expect(client.searchMessages({ guildId: 'invalid' })).rejects.toMatchObject({
        code: 'UNKNOWN',
        message: 'Invalid guild ID format',
      });
    });

    it('should reject invalid channel ID format in searchMessages', async () => {
      await expect(client.searchMessages({ channelId: 'invalid' })).rejects.toMatchObject({
        code: 'UNKNOWN',
        message: 'Invalid channel ID format',
      });
    });

    it('should accept @me as guild ID for DMs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ messages: [], total_results: 0 }),
      });

      // @me is a valid special value for DM guild context
      await expect(
        client.searchMessages({ guildId: '@me', channelId: TEST_CHANNEL_ID }),
      ).resolves.toBeDefined();
    });
  });
});
