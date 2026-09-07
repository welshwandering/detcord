import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildQueryString,
  clamp,
  dateToSnowflake,
  delay,
  escapeHtml,
  formatDuration,
  parseLocalDateEnd,
  parseLocalDateStart,
  snowflakeToDate,
} from './helpers';

describe('dateToSnowflake', () => {
  const DISCORD_EPOCH = 1420070400000;

  it('should convert a Date object to a snowflake', () => {
    const date = new Date('2015-01-01T00:00:00.000Z');
    const snowflake = dateToSnowflake(date);
    // At Discord epoch, the snowflake should be 0
    expect(snowflake).toBe('0');
  });

  it('should convert an ISO string to a snowflake', () => {
    const isoString = '2015-01-01T00:00:00.000Z';
    const snowflake = dateToSnowflake(isoString);
    expect(snowflake).toBe('0');
  });

  it('should handle dates after Discord epoch', () => {
    // 1 second after epoch
    const date = new Date(DISCORD_EPOCH + 1000);
    const snowflake = dateToSnowflake(date);
    // (1000 << 22) = 4194304000
    expect(snowflake).toBe('4194304000');
  });

  it('should handle dates well after Discord epoch', () => {
    // 1 hour after epoch
    const date = new Date(DISCORD_EPOCH + 3600000);
    const snowflake = dateToSnowflake(date);
    // (3600000 << 22) = 15099494400000
    expect(snowflake).toBe('15099494400000');
  });

  it('should handle real Discord timestamp', () => {
    // A specific date: 2023-06-15T12:00:00.000Z
    const date = new Date('2023-06-15T12:00:00.000Z');
    const snowflake = dateToSnowflake(date);
    const expectedTimestamp = date.getTime() - DISCORD_EPOCH;
    const expected = (BigInt(expectedTimestamp) << 22n).toString();
    expect(snowflake).toBe(expected);
  });

  it('should throw for invalid date string', () => {
    expect(() => dateToSnowflake('not-a-date')).toThrow('Invalid date provided');
  });

  it('should throw for invalid Date object', () => {
    expect(() => dateToSnowflake(new Date('invalid'))).toThrow('Invalid date provided');
  });
});

describe('snowflakeToDate', () => {
  const DISCORD_EPOCH = 1420070400000;

  it('should convert snowflake 0 to Discord epoch', () => {
    const date = snowflakeToDate('0');
    expect(date.getTime()).toBe(DISCORD_EPOCH);
  });

  it('should convert a snowflake to correct date', () => {
    // Snowflake for 1 second after epoch: (1000 << 22) = 4194304000
    const date = snowflakeToDate('4194304000');
    expect(date.getTime()).toBe(DISCORD_EPOCH + 1000);
  });

  it('should handle large snowflakes', () => {
    // A real Discord snowflake example
    const snowflake = '1118893459344535562';
    const date = snowflakeToDate(snowflake);
    // Verify it returns a valid date
    expect(date instanceof Date).toBe(true);
    expect(date.getTime()).toBeGreaterThan(DISCORD_EPOCH);
  });

  it('should be inverse of dateToSnowflake', () => {
    const originalDate = new Date('2023-06-15T12:00:00.000Z');
    const snowflake = dateToSnowflake(originalDate);
    const recoveredDate = snowflakeToDate(snowflake);
    // Due to bit shifting, we lose some precision (lower 22 bits)
    // So we compare to millisecond precision
    expect(Math.abs(recoveredDate.getTime() - originalDate.getTime())).toBeLessThan(1);
  });

  it('should throw for empty string', () => {
    expect(() => snowflakeToDate('')).toThrow('Invalid snowflake');
  });

  it('should throw for non-numeric string', () => {
    expect(() => snowflakeToDate('abc123')).toThrow('Invalid snowflake');
  });

  it('should throw for string with spaces', () => {
    expect(() => snowflakeToDate('123 456')).toThrow('Invalid snowflake');
  });
});

describe('formatDuration', () => {
  it('should format zero milliseconds', () => {
    expect(formatDuration(0)).toBe('0s');
  });

  it('should format seconds only', () => {
    expect(formatDuration(5000)).toBe('5s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(65000)).toBe('1m 5s');
  });

  it('should format hours, minutes, and seconds', () => {
    expect(formatDuration(3661000)).toBe('1h 1m 1s');
  });

  it('should format hours only when minutes and seconds are zero', () => {
    expect(formatDuration(3600000)).toBe('1h');
  });

  it('should format hours and seconds without minutes', () => {
    expect(formatDuration(3605000)).toBe('1h 5s');
  });

  it('should format hours and minutes without seconds', () => {
    expect(formatDuration(3660000)).toBe('1h 1m');
  });

  it('should handle negative values', () => {
    expect(formatDuration(-1000)).toBe('0s');
  });

  it('should handle very large values', () => {
    // 100 hours
    const ms = 100 * 3600 * 1000;
    expect(formatDuration(ms)).toBe('100h');
  });

  it('should handle Infinity', () => {
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0s');
  });

  it('should handle NaN', () => {
    expect(formatDuration(Number.NaN)).toBe('0s');
  });

  it('should handle fractional milliseconds by flooring', () => {
    expect(formatDuration(1500)).toBe('1s');
  });
});

describe('escapeHtml', () => {
  it('should escape ampersand', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('should escape less than', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b');
  });

  it('should escape greater than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  it('should escape all special characters in one string', () => {
    expect(escapeHtml('<div class="test" data-name=\'foo\'>a & b</div>')).toBe(
      '&lt;div class=&quot;test&quot; data-name=&#39;foo&#39;&gt;a &amp; b&lt;/div&gt;',
    );
  });

  it('should return empty string for non-string input', () => {
    expect(escapeHtml(null as unknown as string)).toBe('');
    expect(escapeHtml(undefined as unknown as string)).toBe('');
    expect(escapeHtml(123 as unknown as string)).toBe('');
    expect(escapeHtml({} as unknown as string)).toBe('');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should not modify strings without special characters', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('buildQueryString', () => {
  it('should build query string from key-value pairs', () => {
    const params: Array<[string, string | undefined]> = [
      ['foo', 'bar'],
      ['baz', 'qux'],
    ];
    expect(buildQueryString(params)).toBe('foo=bar&baz=qux');
  });

  it('should filter out undefined values', () => {
    const params: Array<[string, string | undefined]> = [
      ['foo', 'bar'],
      ['skip', undefined],
      ['baz', 'qux'],
    ];
    expect(buildQueryString(params)).toBe('foo=bar&baz=qux');
  });

  it('should handle all undefined values', () => {
    const params: Array<[string, string | undefined]> = [
      ['foo', undefined],
      ['bar', undefined],
    ];
    expect(buildQueryString(params)).toBe('');
  });

  it('should handle empty array', () => {
    expect(buildQueryString([])).toBe('');
  });

  it('should encode special characters in values', () => {
    const params: Array<[string, string | undefined]> = [
      ['message', 'hello world'],
      ['special', 'foo&bar=baz'],
    ];
    expect(buildQueryString(params)).toBe('message=hello%20world&special=foo%26bar%3Dbaz');
  });

  it('should encode special characters in keys', () => {
    const params: Array<[string, string | undefined]> = [['key with space', 'value']];
    expect(buildQueryString(params)).toBe('key%20with%20space=value');
  });

  it('should handle empty string values', () => {
    const params: Array<[string, string | undefined]> = [['empty', '']];
    expect(buildQueryString(params)).toBe('empty=');
  });
});

describe('delay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve after specified time', async () => {
    vi.useFakeTimers();
    const promise = delay(1000);

    vi.advanceTimersByTime(999);
    // Promise should still be pending

    vi.advanceTimersByTime(1);
    await promise;
    // If we get here, the promise resolved
    expect(true).toBe(true);
  });

  it('should resolve immediately for zero', async () => {
    const start = Date.now();
    await delay(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('should resolve immediately for negative values', async () => {
    const start = Date.now();
    await delay(-100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('should return a Promise', () => {
    const result = delay(10);
    expect(result).toBeInstanceOf(Promise);
  });
});

describe('clamp', () => {
  it('should return value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('should return min when value is below range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('should return max when value is above range', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('should handle value equal to min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('should handle value equal to max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('should handle negative ranges', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-15, -10, -1)).toBe(-10);
    expect(clamp(0, -10, -1)).toBe(-1);
  });

  it('should handle decimal values', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(1.5, 0, 1)).toBe(1);
    expect(clamp(-0.5, 0, 1)).toBe(0);
  });

  it('should handle NaN by returning min', () => {
    expect(clamp(Number.NaN, 0, 10)).toBe(0);
  });

  it('should handle Infinity', () => {
    expect(clamp(Number.POSITIVE_INFINITY, 0, 10)).toBe(0);
    expect(clamp(Number.NEGATIVE_INFINITY, 0, 10)).toBe(0);
  });

  it('should handle when min equals max', () => {
    expect(clamp(5, 5, 5)).toBe(5);
    expect(clamp(0, 5, 5)).toBe(5);
    expect(clamp(10, 5, 5)).toBe(5);
  });
});

describe('parseLocalDateStart', () => {
  it('should return local midnight for the given day', () => {
    const date = parseLocalDateStart('2024-03-15');

    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(15);
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
    expect(date.getSeconds()).toBe(0);
    expect(date.getMilliseconds()).toBe(0);
  });

  it('should interpret the date locally, not as UTC', () => {
    const date = parseLocalDateStart('2024-03-15');

    // `new Date('2024-03-15')` is parsed as UTC midnight; anywhere off UTC the
    // two differ, and treating a date input as UTC shifts a day's boundary.
    const offsetMinutes = date.getTimezoneOffset();
    expect(date.getTime()).toBe(
      new Date('2024-03-15T00:00:00.000Z').getTime() + offsetMinutes * 60_000,
    );
  });

  it('should accept surrounding whitespace', () => {
    expect(parseLocalDateStart('  2024-03-15  ').getDate()).toBe(15);
  });

  it('should handle leap days', () => {
    expect(parseLocalDateStart('2024-02-29').getMonth()).toBe(1);
  });

  it('should throw for a malformed string', () => {
    expect(() => parseLocalDateStart('15/03/2024')).toThrow('expected YYYY-MM-DD');
    expect(() => parseLocalDateStart('2024-3-15')).toThrow('expected YYYY-MM-DD');
    expect(() => parseLocalDateStart('')).toThrow('expected YYYY-MM-DD');
  });

  it('should throw for non-string input', () => {
    expect(() => parseLocalDateStart(null as unknown as string)).toThrow('expected YYYY-MM-DD');
    expect(() => parseLocalDateStart(20240315 as unknown as string)).toThrow('expected YYYY-MM-DD');
  });

  it('should throw for a day that does not exist', () => {
    expect(() => parseLocalDateStart('2024-02-31')).toThrow('not a real calendar date');
    expect(() => parseLocalDateStart('2023-02-29')).toThrow('not a real calendar date');
    expect(() => parseLocalDateStart('2024-13-01')).toThrow('not a real calendar date');
    expect(() => parseLocalDateStart('2024-00-10')).toThrow('not a real calendar date');
  });
});

describe('parseLocalDateEnd', () => {
  it('should return the last instant of the local day', () => {
    const date = parseLocalDateEnd('2024-03-15');

    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(15);
    expect(date.getHours()).toBe(23);
    expect(date.getMinutes()).toBe(59);
    expect(date.getSeconds()).toBe(59);
    expect(date.getMilliseconds()).toBe(999);
  });

  it('should be exactly one millisecond before the next day starts', () => {
    const end = parseLocalDateEnd('2024-03-15');
    const nextStart = parseLocalDateStart('2024-03-16');

    expect(nextStart.getTime() - end.getTime()).toBe(1);
  });

  it('should throw for invalid input', () => {
    expect(() => parseLocalDateEnd('not-a-date')).toThrow('expected YYYY-MM-DD');
    expect(() => parseLocalDateEnd('2024-04-31')).toThrow('not a real calendar date');
  });
});
