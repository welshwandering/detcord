/**
 * Discord API Client Module
 *
 * Every failure — network, HTTP or protocol — leaves this module as a thrown
 * `DiscordApiError`. Callers branch on `error.code`; nothing is swallowed into
 * a result object, so a throttled delete can never be mistaken for a permanent
 * failure.
 */

import { isValidGuildId, isValidSnowflake, isValidTokenFormat } from '../utils/validators';
import {
  codeForHttpStatus,
  DiscordApiError,
  type DiscordApiErrorCode,
  type DiscordApiErrorOptions,
} from './errors';

/** Discord API version and base URL */
const API_VERSION = 'v10';
const BASE_URL = `https://discord.com/api/${API_VERSION}`;

/** HTTP 202 from search means Discord is still building the message index. */
const HTTP_INDEXING = 202;
/** HTTP 204 from delete means the message is gone. */
const HTTP_NO_CONTENT = 204;
/** HTTP 404 from delete means somebody (or a previous run) got there first. */
const HTTP_NOT_FOUND = 404;

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
 * Values accepted by Discord's `has` search filter.
 */
export type SearchHasFilter = 'link' | 'file' | 'embed' | 'image' | 'video' | 'sound' | 'sticker';

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
  /** Filter for messages containing links (shorthand for `has: ['link']`) */
  hasLink?: boolean;
  /** Filter for messages containing file attachments (shorthand for `has: ['file']`) */
  hasFile?: boolean;
  /** Additional `has` filters; each entry is sent as its own query parameter */
  has?: SearchHasFilter[];
  /** Pagination offset */
  offset?: number;
  /** Include NSFW channels in search */
  includeNsfw?: boolean;
  /** Whether to include pinned messages (not a Discord API param; client-side filtering) */
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
  /** Discord's rate limit bucket identifier, when the response carried one */
  bucket?: string;
  /** True when the most recent response reported a global rate limit */
  global?: boolean;
}

/**
 * Outcome of a successful delete request.
 *
 * `already_gone` means the message no longer exists, which for bulk deletion is
 * a success rather than a failure.
 */
export type DeleteOutcome = 'deleted' | 'already_gone';

/**
 * The account a token belongs to.
 */
export interface CurrentUser {
  id: string;
  username: string;
  /** Discord's newer display name; null for accounts that have not set one */
  globalName: string | null;
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

/** Shape of Discord's JSON error body, as far as we rely on it. */
interface DiscordErrorBody {
  message?: unknown;
  retry_after?: unknown;
  global?: unknown;
  code?: unknown;
}

/**
 * Reads a response body as JSON, tolerating empty or malformed payloads.
 * The body may only be consumed once, so every error path funnels through here.
 */
async function readJsonBody(response: Response): Promise<DiscordErrorBody> {
  try {
    const body: unknown = await response.json();
    return body !== null && typeof body === 'object' ? (body as DiscordErrorBody) : {};
  } catch {
    return {};
  }
}

/**
 * Reads a successful response body as JSON.
 *
 * A 200 whose body is truncated or whose stream fails is a transport problem,
 * not a protocol one, so it leaves the client as a retryable `NETWORK_ERROR`
 * rather than as a bare `SyntaxError` the engine would rethrow.
 *
 * @throws DiscordApiError with code `NETWORK_ERROR`
 */
async function readSuccessBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (err) {
    throw new DiscordApiError('NETWORK_ERROR', "Could not read Discord's response", {
      httpStatus: response.status,
      cause: err,
    });
  }
}

/** The error thrown when a successful response does not carry what we expect. */
function unexpectedShape(response: Response): DiscordApiError {
  return new DiscordApiError('UNKNOWN', 'Unexpected response shape', {
    httpStatus: response.status,
  });
}

/** Whether a parsed body carries the two fields a search response must have. */
function isSearchResponse(data: unknown): data is SearchResponse {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const body = data as { messages?: unknown; total_results?: unknown };
  return (
    Array.isArray(body.messages) &&
    typeof body.total_results === 'number' &&
    Number.isFinite(body.total_results)
  );
}

/**
 * Parses a numeric header value, ignoring absent and non-numeric values.
 */
function parseNumericHeader(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Resolves the retry delay in seconds from the body, then the rate limit
 * headers, then the standard `Retry-After` header.
 */
function resolveRetryAfter(body: DiscordErrorBody, headers: Headers): number | undefined {
  if (typeof body.retry_after === 'number' && Number.isFinite(body.retry_after)) {
    return body.retry_after;
  }
  return (
    parseNumericHeader(headers.get('X-RateLimit-Reset-After')) ??
    parseNumericHeader(headers.get('Retry-After'))
  );
}

/**
 * Detects a global (account-wide) rate limit from response headers.
 */
function isGlobalFromHeaders(headers: Headers): boolean {
  if (headers.get('X-RateLimit-Global')?.toLowerCase() === 'true') {
    return true;
  }
  return headers.get('X-RateLimit-Scope')?.toLowerCase() === 'global';
}

/**
 * Builds the `DiscordApiError` for a non-OK response, consuming its body once.
 *
 * @param response - The response to classify
 * @param overrides - Optional forced code and fallback message
 * @returns The error to throw
 */
async function errorForResponse(
  response: Response,
  overrides: { code?: DiscordApiErrorCode; fallbackMessage?: string } = {},
): Promise<DiscordApiError> {
  const body = await readJsonBody(response);
  const status = response.status;
  const fallback = overrides.fallbackMessage ?? `HTTP ${status}`;
  const message = typeof body.message === 'string' && body.message ? body.message : fallback;

  const options: DiscordApiErrorOptions = {
    httpStatus: status,
    global: body.global === true || isGlobalFromHeaders(response.headers),
  };
  const retryAfter = resolveRetryAfter(body, response.headers);
  if (retryAfter !== undefined) {
    options.retryAfter = retryAfter;
  }
  if (typeof body.code === 'number') {
    options.discordCode = body.code;
  }

  return new DiscordApiError(overrides.code ?? codeForHttpStatus(status), message, options);
}

/**
 * Collects the `has` query values for a search, de-duplicated and ordered.
 */
function collectHasFilters(params: SearchParams): string[] {
  const values = new Set<string>();
  if (params.hasLink) {
    values.add('link');
  }
  if (params.hasFile) {
    values.add('file');
  }
  for (const value of params.has ?? []) {
    values.add(value);
  }
  return [...values];
}

/**
 * Builds the query string for a search request.
 */
function buildSearchQuery(params: SearchParams): string {
  const query = new URLSearchParams();

  if (params.authorId) {
    query.set('author_id', params.authorId);
  }
  if (params.content) {
    query.set('content', params.content);
  }
  if (params.minId) {
    query.set('min_id', params.minId);
  }
  if (params.maxId) {
    query.set('max_id', params.maxId);
  }
  for (const value of collectHasFilters(params)) {
    query.append('has', value);
  }
  if (params.offset !== undefined && params.offset > 0) {
    query.set('offset', String(params.offset));
  }
  if (params.includeNsfw) {
    query.set('include_nsfw', 'true');
  }

  return query.toString();
}

/**
 * Resolves the search endpoint for the requested target.
 *
 * @throws DiscordApiError when the target is missing or malformed
 */
function searchEndpointFor(guildId: string | undefined, channelId: string | undefined): string {
  if (guildId && !isValidGuildId(guildId)) {
    throw new DiscordApiError('UNKNOWN', 'Invalid guild ID format');
  }
  if (channelId && !isValidSnowflake(channelId)) {
    throw new DiscordApiError('UNKNOWN', 'Invalid channel ID format');
  }
  if (guildId) {
    return `${BASE_URL}/guilds/${guildId}/messages/search`;
  }
  if (channelId) {
    return `${BASE_URL}/channels/${channelId}/messages/search`;
  }
  throw new DiscordApiError('UNKNOWN', 'Either guildId or channelId is required for search');
}

/** Channel types whose messages can be searched and deleted. */
const TEXT_CHANNEL_TYPES: ReadonlySet<ChannelType> = new Set([
  ChannelType.GUILD_TEXT,
  ChannelType.GUILD_ANNOUNCEMENT,
  ChannelType.PUBLIC_THREAD,
  ChannelType.PRIVATE_THREAD,
  ChannelType.GUILD_FORUM,
]);

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
   * @throws DiscordApiError on any failure, including `INDEXING` for HTTP 202
   */
  async searchMessages(params: SearchParams): Promise<SearchResponse> {
    const endpoint = searchEndpointFor(params.guildId, params.channelId);
    const queryString = buildSearchQuery(params);
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    const response = await this.makeRequest(url, 'GET');

    if (response.status === HTTP_INDEXING) {
      throw await errorForResponse(response, {
        code: 'INDEXING',
        fallbackMessage: 'Search index is being built, try again later',
      });
    }
    if (!response.ok) {
      throw await errorForResponse(response);
    }

    const data = await readSuccessBody(response);
    if (!isSearchResponse(data)) {
      throw unexpectedShape(response);
    }
    return data;
  }

  /**
   * Delete a specific message
   * @param channelId Channel containing the message
   * @param messageId ID of the message to delete
   * @returns `deleted` on HTTP 204, `already_gone` on HTTP 404
   * @throws DiscordApiError for invalid input and every other response
   */
  async deleteMessage(channelId: string, messageId: string): Promise<DeleteOutcome> {
    if (!channelId || !messageId) {
      throw new DiscordApiError('UNKNOWN', 'channelId and messageId are required');
    }
    if (!isValidSnowflake(channelId)) {
      throw new DiscordApiError('UNKNOWN', 'Invalid channel ID format');
    }
    if (!isValidSnowflake(messageId)) {
      throw new DiscordApiError('UNKNOWN', 'Invalid message ID format');
    }

    const url = `${BASE_URL}/channels/${channelId}/messages/${messageId}`;
    const response = await this.makeRequest(url, 'DELETE');

    if (response.status === HTTP_NO_CONTENT) {
      return 'deleted';
    }
    if (response.status === HTTP_NOT_FOUND) {
      return 'already_gone';
    }
    throw await errorForResponse(response);
  }

  /**
   * Fetch the account the current token belongs to.
   *
   * @returns The authenticated user's ID, username and global name
   * @throws DiscordApiError; `UNAUTHORIZED` when the token is invalid
   */
  async getCurrentUser(): Promise<CurrentUser> {
    const response = await this.makeRequest(`${BASE_URL}/users/@me`, 'GET');

    if (!response.ok) {
      throw await errorForResponse(response);
    }

    const data = (await readSuccessBody(response)) as {
      id?: unknown;
      username?: unknown;
      global_name?: unknown;
    } | null;

    if (typeof data?.id !== 'string' || data.id.length === 0) {
      throw unexpectedShape(response);
    }

    return {
      id: data.id,
      username: typeof data.username === 'string' ? data.username : '',
      globalName: typeof data.global_name === 'string' ? data.global_name : null,
    };
  }

  /**
   * Get all channels in a guild
   * @param guildId The guild ID to fetch channels from
   * @returns Array of channels (filtered to text-based channels)
   * @throws DiscordApiError on invalid input or any failed request
   */
  async getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
    if (!guildId) {
      throw new DiscordApiError('UNKNOWN', 'guildId is required');
    }
    if (!isValidSnowflake(guildId)) {
      throw new DiscordApiError('UNKNOWN', 'Invalid guild ID format');
    }

    const response = await this.makeRequest(`${BASE_URL}/guilds/${guildId}/channels`, 'GET');

    if (!response.ok) {
      throw await errorForResponse(response);
    }

    const channels = await readSuccessBody(response);
    if (!Array.isArray(channels)) {
      throw unexpectedShape(response);
    }
    return (channels as DiscordChannel[]).filter((channel) => TEXT_CHANNEL_TYPES.has(channel.type));
  }

  /**
   * Make an authenticated request to the Discord API.
   *
   * Neither GET nor DELETE carries a body, so no `Content-Type` is sent.
   */
  private async makeRequest(url: string, method: 'GET' | 'DELETE'): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { Authorization: this.token },
      });
    } catch (err) {
      throw new DiscordApiError(
        'NETWORK_ERROR',
        err instanceof Error ? err.message : 'Network request failed',
        { cause: err },
      );
    }

    this.updateRateLimitInfo(response.headers);
    return response;
  }

  /**
   * Update rate limit info from response headers, ignoring unparsable values.
   */
  private updateRateLimitInfo(headers: Headers): void {
    const remaining = parseNumericHeader(headers.get('X-RateLimit-Remaining'));
    const limit = parseNumericHeader(headers.get('X-RateLimit-Limit'));
    const resetAfter = parseNumericHeader(headers.get('X-RateLimit-Reset-After'));

    if (remaining === undefined || limit === undefined || resetAfter === undefined) {
      return;
    }

    const info: RateLimitInfo = { remaining, limit, resetAfter };
    const bucket = headers.get('X-RateLimit-Bucket');
    if (bucket) {
      info.bucket = bucket;
    }
    if (isGlobalFromHeaders(headers)) {
      info.global = true;
    }
    this.rateLimitInfo = info;
  }
}
