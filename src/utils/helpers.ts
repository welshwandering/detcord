/**
 * Utility functions for Detcord message deletion tool
 */

/**
 * Discord epoch: 2015-01-01T00:00:00.000Z in milliseconds
 */
const DISCORD_EPOCH = 1420070400000n;

/**
 * Convert a Date or ISO string to a Discord snowflake ID.
 * Discord snowflakes encode timestamps with the formula:
 * ((timestamp_ms - DISCORD_EPOCH) << 22)
 *
 * @param date - Date object or ISO date string
 * @returns Snowflake ID as a string
 */
export function dateToSnowflake(date: Date | string): string {
  const timestamp = date instanceof Date ? date.getTime() : new Date(date).getTime();

  if (Number.isNaN(timestamp)) {
    throw new Error('Invalid date provided');
  }

  const timestampBigInt = BigInt(timestamp);
  const snowflake = (timestampBigInt - DISCORD_EPOCH) << 22n;

  return snowflake.toString();
}

/**
 * Convert a Discord snowflake ID to a Date object.
 * Extracts the timestamp using: (snowflake >> 22) + DISCORD_EPOCH
 *
 * @param snowflake - Discord snowflake ID as a string
 * @returns Date object representing when the snowflake was created
 */
export function snowflakeToDate(snowflake: string): Date {
  if (!snowflake || !/^\d+$/.test(snowflake)) {
    throw new Error('Invalid snowflake: must be a numeric string');
  }

  const snowflakeBigInt = BigInt(snowflake);
  const timestamp = (snowflakeBigInt >> 22n) + DISCORD_EPOCH;

  return new Date(Number(timestamp));
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * Format: "Xh Ym Zs"
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) {
    return '0s';
  }

  if (ms <= 0) {
    return '0s';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
}

/**
 * Escape special HTML characters to prevent XSS attacks.
 * Escapes: & < > " '
 *
 * @param str - String to escape
 * @returns HTML-escaped string, or empty string for non-string input
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') {
    return '';
  }

  const htmlEscapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return str.replace(/[&<>"']/g, (char) => htmlEscapeMap[char] ?? char);
}

/**
 * Build a URL query string from key-value pairs.
 * Filters out undefined values and properly encodes values.
 *
 * @param params - Array of [key, value] tuples
 * @returns Query string (without leading '?')
 */
export function buildQueryString(params: Array<[string, string | undefined]>): string {
  return params
    .filter((pair): pair is [string, string] => pair[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * Create a promise that resolves after a specified delay.
 *
 * @param ms - Delay in milliseconds
 * @returns Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clamp a value between a minimum and maximum.
 *
 * @param value - The value to clamp
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns The clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

/**
 * Matches the `YYYY-MM-DD` value produced by `<input type="date">`.
 */
const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a `YYYY-MM-DD` string into calendar parts, rejecting anything that is
 * not a real date. `new Date('2024-02-31')` silently rolls over into March, so
 * the parsed components are checked against the constructed date.
 *
 * @param yyyyMmDd - Date string in `YYYY-MM-DD` form
 * @param hours - Hour to set on the resulting local date
 * @param minutes - Minute to set on the resulting local date
 * @param seconds - Second to set on the resulting local date
 * @param milliseconds - Millisecond to set on the resulting local date
 * @returns The date in the browser's local time zone
 * @throws Error when the string is malformed or names a non-existent day
 */
function parseLocalDate(
  yyyyMmDd: string,
  hours: number,
  minutes: number,
  seconds: number,
  milliseconds: number,
): Date {
  const match = typeof yyyyMmDd === 'string' ? LOCAL_DATE_PATTERN.exec(yyyyMmDd.trim()) : null;
  if (!match) {
    throw new Error('Invalid date: expected YYYY-MM-DD');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, hours, minutes, seconds, milliseconds);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    Number.isNaN(date.getTime())
  ) {
    throw new Error(`Invalid date: ${yyyyMmDd} is not a real calendar date`);
  }

  return date;
}

/**
 * Convert a `YYYY-MM-DD` string to local midnight on that day.
 *
 * Date inputs are naive about time zones; treating them as UTC shifts the
 * boundary by hours, which silently includes or excludes a day's messages.
 *
 * @param yyyyMmDd - Date string in `YYYY-MM-DD` form
 * @returns Local time 00:00:00.000 on that day
 * @throws Error when the string is malformed or names a non-existent day
 */
export function parseLocalDateStart(yyyyMmDd: string): Date {
  return parseLocalDate(yyyyMmDd, 0, 0, 0, 0);
}

/**
 * Convert a `YYYY-MM-DD` string to the last instant of that local day.
 *
 * @param yyyyMmDd - Date string in `YYYY-MM-DD` form
 * @returns Local time 23:59:59.999 on that day
 * @throws Error when the string is malformed or names a non-existent day
 */
export function parseLocalDateEnd(yyyyMmDd: string): Date {
  return parseLocalDate(yyyyMmDd, 23, 59, 59, 999);
}
