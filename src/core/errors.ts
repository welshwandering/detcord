/**
 * Typed errors for Discord API operations.
 *
 * Every failure surfaced by the API client is a `DiscordApiError` so that the
 * deletion engine can branch on `code` rather than on ad-hoc status fields.
 */

/**
 * Discord JSON error code returned when a message lives in an archived thread.
 * @see https://discord.com/developers/docs/topics/opcodes-and-status-codes#json
 */
export const DISCORD_ERROR_THREAD_ARCHIVED = 50083;

/**
 * Classification of an API failure.
 *
 * - `RATE_LIMITED`  HTTP 429; `retryAfter` holds the wait in seconds.
 * - `INDEXING`      HTTP 202 from search; the index is still being built.
 * - `UNAUTHORIZED`  HTTP 401; the token is invalid or expired. Never retry.
 * - `FORBIDDEN`     HTTP 403; the caller may not act on this resource.
 * - `NOT_FOUND`     HTTP 404; the resource is gone.
 * - `NETWORK_ERROR` `fetch` rejected before a response arrived.
 * - `SERVER_ERROR`  HTTP 5xx.
 * - `UNKNOWN`       Anything else; `httpStatus` is set when a response existed.
 */
export type DiscordApiErrorCode =
  | 'RATE_LIMITED'
  | 'INDEXING'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

/** Codes for which a retry after a delay is reasonable. */
const RETRYABLE_CODES: ReadonlySet<DiscordApiErrorCode> = new Set<DiscordApiErrorCode>([
  'RATE_LIMITED',
  'INDEXING',
  'NETWORK_ERROR',
  'SERVER_ERROR',
]);

/** Optional detail attached to a `DiscordApiError`. */
export interface DiscordApiErrorOptions {
  /** HTTP status of the response, when one was received. */
  httpStatus?: number;
  /** Seconds to wait before retrying (from `retry_after` or `X-RateLimit-Reset-After`). */
  retryAfter?: number;
  /** True when a 429 was a global rate limit rather than a per-route one. */
  global?: boolean;
  /** Discord's JSON error `code`, when the body carried one (e.g. 50083). */
  discordCode?: number;
  /** Underlying error, for network failures. */
  cause?: unknown;
}

/**
 * Error thrown by `DiscordApiClient` for every failed request.
 */
export class DiscordApiError extends Error {
  readonly code: DiscordApiErrorCode;
  readonly httpStatus: number | undefined;
  readonly retryAfter: number | undefined;
  readonly global: boolean;
  readonly discordCode: number | undefined;

  constructor(code: DiscordApiErrorCode, message: string, options: DiscordApiErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'DiscordApiError';
    this.code = code;
    this.httpStatus = options.httpStatus;
    this.retryAfter = options.retryAfter;
    this.global = options.global ?? false;
    this.discordCode = options.discordCode;
  }

  /** Whether waiting and retrying could succeed. */
  get isRetryable(): boolean {
    return RETRYABLE_CODES.has(this.code);
  }

  /** Whether this failure means the message is in an archived thread. */
  get isArchivedThread(): boolean {
    return this.code === 'FORBIDDEN' && this.discordCode === DISCORD_ERROR_THREAD_ARCHIVED;
  }

  /** Type guard for unknown values caught in `catch` blocks. */
  static is(value: unknown): value is DiscordApiError {
    return value instanceof DiscordApiError;
  }
}

/**
 * Maps an HTTP status to an error code.
 *
 * @param status - HTTP response status
 * @returns The matching code; `UNKNOWN` for unclassified statuses
 */
export function codeForHttpStatus(status: number): DiscordApiErrorCode {
  if (status === 429) return 'RATE_LIMITED';
  if (status === 202) return 'INDEXING';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status >= 500 && status <= 599) return 'SERVER_ERROR';
  return 'UNKNOWN';
}
