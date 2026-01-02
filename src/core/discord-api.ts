/**
 * Discord API Client Module
 */

import { isValidGuildId, isValidSnowflake, isValidTokenFormat } from '../utils/validators';

/** Discord API version and base URL */
const API_VERSION = 'v10';
const BASE_URL = `https://discord.com/api/${API_VERSION}`;

/**
 * Discord message author information
 */
export interface DiscordAuthor {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
}

/**
 * Discord message attachment
 */
export interface DiscordAttachment {
  id: string;
  filename: string;
  size: number;
  url: string;
  proxy_url: string;
  content_type?: string;
}

/**
 * Discord embed structure
 */
export interface DiscordEmbed {
  type: string;
  url?: string;
  title?: string;
  description?: string;
}

/**
 * Discord message structure from API response
 */
export interface DiscordMessage {
  id: string;
  channel_id: string;
  author: DiscordAuthor;
  content: string;
  timestamp: string;
  attachments: DiscordAttachment[];
  embeds: DiscordEmbed[];
  pinned: boolean;
  type: number;
  /** Present when message is a search result hit */
  hit?: boolean;
}

/**
 * Parameters for message search requests
 */
export interface SearchParams {
  /** Filter by message author ID */
  authorId?: string;
  /** Guild ID for server-wide search */
  guildId?: string;
  /** Channel ID for channel-specific search (also used for DMs) */
  channelId?: string;
  /** Minimum snowflake ID (messages after) */
  minId?: string;
  /** Maximum snowflake ID (messages before) */
  maxId?: string;
  /** Text content to search for */
  content?: string;
  /** Filter for messages containing links */
  hasLink?: boolean;
  /** Filter for messages containing file attachments */
  hasFile?: boolean;
  /** Pagination offset */
  offset?: number;
  /** Include NSFW channels in search */
  includeNsfw?: boolean;
  /** Whether to include pinned messages (note: not a Discord API param, used for client-side filtering) */
  includePinned?: boolean;
}

/**
 * Response structure from search endpoint
 */
export interface SearchResponse {
  /** Nested arrays of messages (each inner array is a context group) */
  messages: DiscordMessage[][];
  /** Total count of matching messages */
  total_results: number;
}

/**
 * Rate limit information extracted from response headers
 */
export interface RateLimitInfo {
  /** Number of requests remaining in current window */
  remaining: number;
  /** Total request limit for this endpoint */
  limit: number;
  /** Seconds until rate limit resets */
  resetAfter: number;
}

/**
 * Result of a delete operation
 */
export interface DeleteResult {
  success: boolean;
  /** Error message if deletion failed */
  error?: string;
  /** Retry after seconds if rate limited */
  retryAfter?: number;
  /** True if indexing is still in progress (202 response) */
  indexing?: boolean;
}

/**
 * Error types that can occur during API operations
 */
export type DiscordApiErrorCode =
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'INDEXING'
  | 'UNKNOWN';

/**
 * Structured error from Discord API operations
 */
export interface DiscordApiError {
  code: DiscordApiErrorCode;
  message: string;
  retryAfter?: number;
  httpStatus?: number;
}

/**
 * Discord channel types
 */
export enum ChannelType {
  GUILD_TEXT = 0,
  DM = 1,
  GUILD_VOICE = 2,
  GROUP_DM = 3,
  GUILD_CATEGORY = 4,
  GUILD_ANNOUNCEMENT = 5,
  ANNOUNCEMENT_THREAD = 10,
  PUBLIC_THREAD = 11,
  PRIVATE_THREAD = 12,
  GUILD_STAGE_VOICE = 13,
  GUILD_DIRECTORY = 14,
  GUILD_FORUM = 15,
  GUILD_MEDIA = 16,
}

/**
 * Discord channel structure from API response
 */
export interface DiscordChannel {
  id: string;
  type: ChannelType;
  guild_id?: string;
  position?: number;
  name?: string;
  topic?: string | null;
  nsfw?: boolean;
  parent_id?: string | null;
}

/**
 * Discord API Client for message search and deletion
 */
export class DiscordApiClient {
  private readonly token: string;
  private rateLimitInfo: RateLimitInfo | null = null;

  /**
   * Create a new Discord API client
   * @param token User authentication token (without "Bot " prefix)
   * @throws Error if token is missing or has invalid format
   */
  constructor(token: string) {
    if (!token || typeof token !== 'string') {
      throw new Error('Token is required and must be a string');
    }
    if (!isValidTokenFormat(token)) {
      throw new Error('Token has invalid format');
    }
    this.token = token;
  }

  /**
   * Get current rate limit information from most recent request
   * @returns Rate limit info or null if no requests have been made
   */
  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Search for messages in a guild or channel
   * @param params Search parameters
   * @returns Search response with messages and total count
   * @throws DiscordApiError on API errors
   */
  async searchMessages(params: SearchParams): Promise<SearchResponse> {
    const { guildId, channelId, ...queryParams } = params;

    // Validate IDs before constructing URLs
    if (guildId && !isValidGuildId(guildId)) {
      throw this.createError('UNKNOWN', 'Invalid guild ID format');
    }
    if (channelId && !isValidSnowflake(channelId)) {
      throw this.createError('UNKNOWN', 'Invalid channel ID format');
    }

    // Determine endpoint based on whether we're searching a guild or channel
    let endpoint: string;
    if (guildId) {
      endpoint = `${BASE_URL}/guilds/${guildId}/messages/search`;
    } else if (channelId) {
      endpoint = `${BASE_URL}/channels/${channelId}/messages/search`;
    } else {
      throw this.createError('UNKNOWN', 'Either guildId or channelId is required for search');
    }

    // Build query string
    const searchParams = new URLSearchParams();

    if (queryParams.authorId) {
      searchParams.set('author_id', queryParams.authorId);
    }
    if (queryParams.content) {
      searchParams.set('content', queryParams.content);
    }
    if (queryParams.minId) {
      searchParams.set('min_id', queryParams.minId);
    }
    if (queryParams.maxId) {
      searchParams.set('max_id', queryParams.maxId);
    }
    if (queryParams.hasLink) {
      searchParams.set('has', 'link');
    }
    if (queryParams.hasFile) {
      searchParams.set('has', 'file');
    }
    if (queryParams.offset !== undefined && queryParams.offset > 0) {
      searchParams.set('offset', String(queryParams.offset));
    }
    if (queryParams.includeNsfw) {
      searchParams.set('include_nsfw', 'true');
    }

    const queryString = searchParams.toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    const response = await this.makeRequest(url, 'GET');

    // Handle 202 Accepted (indexing in progress)
    if (response.status === 202) {
      throw this.createError('INDEXING', 'Search index is being built, try again later');
    }

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    const data = (await response.json()) as SearchResponse;
    return data;
  }

  /**
   * Get all channels in a guild
   * @param guildId The guild ID to fetch channels from
   * @returns Array of channels (filtered to text-based channels)
   */
  async getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
    if (!guildId) {
      throw this.createError('UNKNOWN', 'guildId is required');
    }
    if (!isValidSnowflake(guildId)) {
      throw this.createError('UNKNOWN', 'Invalid guild ID format');
    }

    const url = `${BASE_URL}/guilds/${guildId}/channels`;
    const response = await this.makeRequest(url, 'GET');

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    const channels = (await response.json()) as DiscordChannel[];

    // Filter to only text-based channels where messages can be searched
    const textChannelTypes = new Set([
      ChannelType.GUILD_TEXT,
      ChannelType.GUILD_ANNOUNCEMENT,
      ChannelType.PUBLIC_THREAD,
      ChannelType.PRIVATE_THREAD,
      ChannelType.GUILD_FORUM,
    ]);

    return channels.filter((ch) => textChannelTypes.has(ch.type));
  }

  /**
   * Delete a specific message
   * @param channelId Channel containing the message
   * @param messageId ID of the message to delete
   * @returns Delete result indicating success or failure
   */
  async deleteMessage(channelId: string, messageId: string): Promise<DeleteResult> {
    if (!channelId || !messageId) {
      return {
        success: false,
        error: 'channelId and messageId are required',
      };
    }
    if (!isValidSnowflake(channelId)) {
      return {
        success: false,
        error: 'Invalid channel ID format',
      };
    }
    if (!isValidSnowflake(messageId)) {
      return {
        success: false,
        error: 'Invalid message ID format',
      };
    }

    const url = `${BASE_URL}/channels/${channelId}/messages/${messageId}`;

    try {
      const response = await this.makeRequest(url, 'DELETE');

      // 204 No Content = success
      if (response.status === 204) {
        return { success: true };
      }

      // 202 Accepted = indexing in progress
      if (response.status === 202) {
        return {
          success: false,
          indexing: true,
          error: 'Message indexing in progress',
        };
      }

      // 429 Rate Limited
      if (response.status === 429) {
        const body = (await response.json()) as { retry_after?: number };
        const retryAfter = body.retry_after ?? this.rateLimitInfo?.resetAfter ?? 1;
        return {
          success: false,
          error: 'Rate limited',
          retryAfter,
        };
      }

      // Other errors
      const error = await this.handleErrorResponse(response);
      return {
        success: false,
        error: error.message,
      };
    } catch (err) {
      if (this.isDiscordApiError(err)) {
        const result: DeleteResult = {
          success: false,
          error: err.message,
        };
        if (err.retryAfter !== undefined) {
          result.retryAfter = err.retryAfter;
        }
        return result;
      }
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Make an authenticated request to the Discord API
   */
  private async makeRequest(url: string, method: string): Promise<Response> {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: this.token,
          'Content-Type': 'application/json',
        },
      });

      // Extract rate limit headers
      this.updateRateLimitInfo(response.headers);

      return response;
    } catch (err) {
      throw this.createError(
        'NETWORK_ERROR',
        err instanceof Error ? err.message : 'Network request failed',
      );
    }
  }

  /**
   * Update rate limit info from response headers
   */
  private updateRateLimitInfo(headers: Headers): void {
    const remaining = headers.get('X-RateLimit-Remaining');
    const limit = headers.get('X-RateLimit-Limit');
    const resetAfter = headers.get('X-RateLimit-Reset-After');

    if (remaining !== null && limit !== null && resetAfter !== null) {
      this.rateLimitInfo = {
        remaining: Number.parseInt(remaining, 10),
        limit: Number.parseInt(limit, 10),
        resetAfter: Number.parseFloat(resetAfter),
      };
    }
  }

  /**
   * Handle error responses from the API
   */
  private async handleErrorResponse(response: Response): Promise<DiscordApiError> {
    let message = `HTTP ${response.status}`;

    try {
      const body = (await response.json()) as { message?: string; retry_after?: number };
      if (body.message) {
        message = body.message;
      }

      if (response.status === 429) {
        return this.createError('RATE_LIMITED', message, body.retry_after, response.status);
      }
    } catch {
      // JSON parsing failed, use status text
      message = response.statusText || message;
    }

    switch (response.status) {
      case 401:
        return this.createError('UNAUTHORIZED', message, undefined, response.status);
      case 403:
        return this.createError('FORBIDDEN', message, undefined, response.status);
      case 404:
        return this.createError('NOT_FOUND', message, undefined, response.status);
      default:
        return this.createError('UNKNOWN', message, undefined, response.status);
    }
  }

  /**
   * Create a structured API error
   */
  private createError(
    code: DiscordApiErrorCode,
    message: string,
    retryAfter?: number,
    httpStatus?: number,
  ): DiscordApiError {
    const error: DiscordApiError = { code, message };
    if (retryAfter !== undefined) {
      error.retryAfter = retryAfter;
    }
    if (httpStatus !== undefined) {
      error.httpStatus = httpStatus;
    }
    return error;
  }

  /**
   * Type guard for DiscordApiError
   */
  private isDiscordApiError(err: unknown): err is DiscordApiError {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      'message' in err &&
      typeof (err as DiscordApiError).code === 'string' &&
      typeof (err as DiscordApiError).message === 'string'
    );
  }
}
