import { describe, expect, it } from 'vitest';
import { codeForHttpStatus, DISCORD_ERROR_THREAD_ARCHIVED, DiscordApiError } from './errors';

describe('DiscordApiError', () => {
  it('is a real Error with name, code and message', () => {
    const err = new DiscordApiError('RATE_LIMITED', 'slow down', {
      httpStatus: 429,
      retryAfter: 2.5,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DiscordApiError);
    expect(err.name).toBe('DiscordApiError');
    expect(err.message).toBe('slow down');
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.httpStatus).toBe(429);
    expect(err.retryAfter).toBe(2.5);
    expect(err.global).toBe(false);
    expect(String(err)).toContain('slow down');
  });

  it('defaults optional detail to undefined', () => {
    const err = new DiscordApiError('UNKNOWN', 'x');
    expect(err.httpStatus).toBeUndefined();
    expect(err.retryAfter).toBeUndefined();
    expect(err.discordCode).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });

  it('keeps the cause for network failures', () => {
    const cause = new TypeError('Failed to fetch');
    const err = new DiscordApiError('NETWORK_ERROR', 'network', { cause });
    expect(err.cause).toBe(cause);
  });

  it.each([
    ['RATE_LIMITED', true],
    ['INDEXING', true],
    ['NETWORK_ERROR', true],
    ['SERVER_ERROR', true],
    ['UNAUTHORIZED', false],
    ['FORBIDDEN', false],
    ['NOT_FOUND', false],
    ['UNKNOWN', false],
  ] as const)('%s isRetryable=%s', (code, retryable) => {
    expect(new DiscordApiError(code, 'm').isRetryable).toBe(retryable);
  });

  it('recognises an archived-thread 403 by Discord error code', () => {
    const archived = new DiscordApiError('FORBIDDEN', 'Thread is archived', {
      httpStatus: 403,
      discordCode: DISCORD_ERROR_THREAD_ARCHIVED,
    });
    const plain = new DiscordApiError('FORBIDDEN', 'Missing Permissions', { httpStatus: 403 });
    expect(archived.isArchivedThread).toBe(true);
    expect(plain.isArchivedThread).toBe(false);
  });

  it('type guard accepts only DiscordApiError instances', () => {
    expect(DiscordApiError.is(new DiscordApiError('UNKNOWN', 'm'))).toBe(true);
    expect(DiscordApiError.is(new Error('m'))).toBe(false);
    expect(DiscordApiError.is({ code: 'UNKNOWN', message: 'm' })).toBe(false);
    expect(DiscordApiError.is(null)).toBe(false);
  });
});

describe('codeForHttpStatus', () => {
  it.each([
    [429, 'RATE_LIMITED'],
    [202, 'INDEXING'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [500, 'SERVER_ERROR'],
    [503, 'SERVER_ERROR'],
    [400, 'UNKNOWN'],
    [418, 'UNKNOWN'],
  ] as const)('%i -> %s', (status, code) => {
    expect(codeForHttpStatus(status)).toBe(code);
  });
});
