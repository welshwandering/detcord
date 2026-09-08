/**
 * Immutable run configuration.
 *
 * A `RunConfig` is built once, when the user reaches the review step. Preview,
 * the review summary and the deletion run all read the same object, so what is
 * previewed is exactly what is deleted. Anything that could change the meaning
 * of the config (form state, SPA route) is captured inside it, and the
 * signature is compared later to detect drift.
 */

import { dateToSnowflake } from '../utils/helpers';
import { isValidSnowflake, validateRegex } from '../utils/validators';
import { MAX_SELECTED_CHANNELS } from './constants';
import type { DeletionEngineOptions, DeletionOrder } from './ports';

/** Where the user wants to delete from. */
export type TargetScope = 'channel' | 'dm' | 'server' | 'specific';

/** A validated, immutable description of one deletion run. */
export interface RunConfig {
  readonly authorId: string;
  readonly scope: TargetScope;
  readonly guildId: string | undefined;
  /** Channels the run visits, in order. Always at least one entry. */
  readonly channelIds: readonly string[];
  /** `location.pathname` when the config was built. */
  readonly routePath: string;
  readonly after: Date | undefined;
  readonly before: Date | undefined;
  /**
   * Upper bound on the messages a run may touch.
   *
   * Captured when the config is built, so messages posted after the preview
   * are out of scope for the run the user confirmed.
   */
  readonly newestAllowed: Date;
  readonly content: string | undefined;
  readonly pattern: string | undefined;
  readonly hasLink: boolean;
  readonly hasFile: boolean;
  readonly includePinned: boolean;
  readonly deletionOrder: DeletionOrder;
  /** Human label for the chosen time range, e.g. "Last 24 hours". */
  readonly timeRangeLabel: string;
}

/** Raw wizard state handed to {@link buildRunConfig}. */
export interface RunConfigInput {
  authorId: string | null;
  scope: TargetScope;
  guildId: string | null;
  urlChannelId: string | null;
  routePath: string;
  selectedChannelIds: readonly string[];
  manualChannelId: string;
  after: Date | null;
  before: Date | null;
  /**
   * Upper bound to reuse, for a resumed run. A fresh run leaves this unset and
   * gets the current instant.
   */
  newestAllowed?: Date | null;
  timeRangeLabel: string;
  content: string;
  pattern: string;
  hasLink: boolean;
  hasFile: boolean;
  includePinned: boolean;
  deletionOrder: DeletionOrder;
}

/** Result of building a run config. */
export type RunConfigResult =
  | { readonly ok: true; readonly config: RunConfig }
  | { readonly ok: false; readonly error: string };

/** One line of the review screen summary. */
export interface SummaryLine {
  readonly label: string;
  readonly value: string;
}

interface TargetResolution {
  readonly guildId: string | undefined;
  readonly channelIds: readonly string[];
}

/**
 * Resolves a "Whole Server" target.
 *
 * @param input - Raw wizard state
 * @returns The resolved target, or an error message
 */
function resolveServerTarget(input: RunConfigInput): TargetResolution | string {
  if (!input.guildId || input.guildId === '@me') {
    return 'Whole Server needs a server. Open a server channel and try again.';
  }
  if (!input.urlChannelId) {
    return 'Could not detect the current channel. Open a channel in this server and try again.';
  }
  return { guildId: input.guildId, channelIds: [input.urlChannelId] };
}

/**
 * Resolves a "Specific" target from the picker and the manual ID field.
 *
 * An empty selection is a validation error: it must never silently fall back
 * to whichever channel happens to be open. The selection is capped because
 * every channel is previewed before the run starts.
 *
 * @param input - Raw wizard state
 * @returns The resolved target, or an error message
 */
function resolveSpecificTarget(input: RunConfigInput): TargetResolution | string {
  const manual = input.manualChannelId.trim();
  const ids = [...input.selectedChannelIds];
  if (manual && !ids.includes(manual)) {
    ids.push(manual);
  }
  if (ids.length === 0) {
    return 'Pick at least one channel, or enter a channel ID.';
  }
  if (ids.length > MAX_SELECTED_CHANNELS) {
    return `Select up to ${MAX_SELECTED_CHANNELS} channels per run.`;
  }
  const invalid = ids.find((id) => !isValidSnowflake(id));
  if (invalid !== undefined) {
    return `"${invalid}" is not a valid Discord channel ID (17-19 digits).`;
  }
  return { guildId: undefined, channelIds: ids };
}

/**
 * Resolves the target scope into a guild and a concrete list of channels.
 *
 * @param input - Raw wizard state
 * @returns The resolved target, or an error message
 */
function resolveTarget(input: RunConfigInput): TargetResolution | string {
  if (input.scope === 'server') {
    return resolveServerTarget(input);
  }
  if (input.scope === 'specific') {
    return resolveSpecificTarget(input);
  }
  if (!input.urlChannelId || !isValidSnowflake(input.urlChannelId)) {
    return 'Could not detect the current channel. Open a channel and try again.';
  }
  return { guildId: undefined, channelIds: [input.urlChannelId] };
}

/**
 * Checks the time range and regex pattern.
 *
 * @param input - Raw wizard state
 * @returns An error message, or null when both are acceptable
 */
function validateFilters(input: RunConfigInput): string | null {
  if (input.after && input.before && input.after.getTime() >= input.before.getTime()) {
    return 'The "from" date must be before the "to" date.';
  }
  if (input.pattern.trim()) {
    const result = validateRegex(input.pattern.trim());
    if (!result.valid) {
      return result.error ?? 'Invalid regex pattern.';
    }
  }
  return null;
}

/**
 * Builds an immutable, validated run configuration from wizard state.
 *
 * @param input - Raw wizard state
 * @returns The config, or the first validation error found
 */
export function buildRunConfig(input: RunConfigInput): RunConfigResult {
  if (!input.authorId) {
    return { ok: false, error: 'Your Discord user ID is unknown. Re-check your token.' };
  }

  const target = resolveTarget(input);
  if (typeof target === 'string') {
    return { ok: false, error: target };
  }

  const filterError = validateFilters(input);
  if (filterError) {
    return { ok: false, error: filterError };
  }

  return {
    ok: true,
    config: Object.freeze({
      authorId: input.authorId,
      scope: input.scope,
      guildId: target.guildId,
      channelIds: Object.freeze([...target.channelIds]),
      routePath: input.routePath,
      after: input.after ?? undefined,
      before: input.before ?? undefined,
      newestAllowed: input.newestAllowed ?? new Date(),
      content: input.content.trim() || undefined,
      pattern: input.pattern.trim() || undefined,
      hasLink: input.hasLink,
      hasFile: input.hasFile,
      includePinned: input.includePinned,
      deletionOrder: input.deletionOrder,
      timeRangeLabel: input.timeRangeLabel,
    }),
  };
}

/**
 * Produces a stable string identifying a config.
 *
 * Two configs with the same signature target the same messages, so a preview
 * taken for one is valid for the other.
 *
 * @param config - The config to fingerprint
 * @returns A comparable signature string
 */
export function runConfigSignature(config: RunConfig): string {
  return JSON.stringify([
    config.authorId,
    config.scope,
    config.guildId ?? '',
    [...config.channelIds],
    config.routePath,
    config.after?.getTime() ?? 0,
    config.before?.getTime() ?? 0,
    config.newestAllowed.getTime(),
    config.content ?? '',
    config.pattern ?? '',
    config.hasLink,
    config.hasFile,
    config.includePinned,
    config.deletionOrder,
  ]);
}

/**
 * Formats a Date for the review screen in the user's local time.
 *
 * @param date - The date to format
 * @returns Localised date and time
 */
function formatLocal(date: Date): string {
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/**
 * Describes the resolved time range in local time.
 *
 * @param config - The config to describe
 * @returns Human-readable range
 */
export function describeTimeRange(config: RunConfig): string {
  if (!config.after && !config.before) {
    return 'All time';
  }
  if (config.after && config.before) {
    return `${formatLocal(config.after)} to ${formatLocal(config.before)}`;
  }
  if (config.after) {
    return `After ${formatLocal(config.after)}`;
  }
  return `Before ${formatLocal(config.before as Date)}`;
}

/**
 * Describes the target of a run, including the raw Discord IDs.
 *
 * @param config - The config to describe
 * @returns Human-readable target
 */
export function describeTarget(config: RunConfig): string {
  if (config.scope === 'server') {
    return `Server ${config.guildId ?? '?'} (all channels)`;
  }
  if (config.scope === 'specific') {
    const count = config.channelIds.length;
    if (count === 1) {
      return `Channel ${config.channelIds[0]}`;
    }
    return `${count} channels: ${config.channelIds.join(', ')}`;
  }
  const label = config.scope === 'dm' ? 'DM' : 'Channel';
  return `${label} ${config.channelIds[0]}`;
}

/**
 * The newest message a run may touch.
 *
 * Anything posted after the config was built is out of scope, so a run started
 * minutes after the preview cannot sweep up newer messages.
 *
 * @param config - The config to bound
 * @returns The earlier of the "before" filter and the capture instant
 */
export function newestBoundary(config: RunConfig): Date {
  const before = config.before;
  if (before && before.getTime() < config.newestAllowed.getTime()) {
    return before;
  }
  return config.newestAllowed;
}

/**
 * Builds the label/value pairs shown on the review screen.
 *
 * @param config - The config to describe
 * @returns One entry per summary line
 */
export function describeRunConfig(config: RunConfig): SummaryLine[] {
  const lines: SummaryLine[] = [
    { label: 'Target', value: describeTarget(config) },
    { label: 'Time range', value: `${config.timeRangeLabel} - ${describeTimeRange(config)}` },
    { label: 'Cutoff', value: `Messages up to ${formatLocal(newestBoundary(config))}` },
  ];

  const filters: string[] = [];
  if (config.content) {
    filters.push(`contains "${config.content}"`);
  }
  if (config.pattern) {
    filters.push(`matches /${config.pattern}/i`);
  }
  if (config.hasLink) {
    filters.push('has a link');
  }
  if (config.hasFile) {
    filters.push('has an attachment');
  }
  filters.push(config.includePinned ? 'includes pinned' : 'skips pinned');
  lines.push({ label: 'Filters', value: filters.join(', ') });

  return lines;
}

/**
 * Converts a run config into engine options for one channel.
 *
 * @param config - The immutable run config
 * @param channelId - The channel this leg of the run targets
 * @param authToken - Discord auth token
 * @returns Options ready for `engine.configure()`
 */
export function engineOptionsFor(
  config: RunConfig,
  channelId: string,
  authToken: string,
): DeletionEngineOptions {
  const options: DeletionEngineOptions = {
    authToken,
    authorId: config.authorId,
    channelId,
    deletionOrder: config.deletionOrder,
    includePinned: config.includePinned,
    hasLink: config.hasLink,
    hasFile: config.hasFile,
  };

  if (config.scope === 'server' && config.guildId) {
    options.guildId = config.guildId;
  }
  if (config.after) {
    options.minId = dateToSnowflake(config.after);
  }
  options.maxId = dateToSnowflake(newestBoundary(config));
  if (config.content) {
    options.content = config.content;
  }
  if (config.pattern) {
    options.pattern = config.pattern;
  }

  return options;
}
