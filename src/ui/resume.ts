/**
 * Resuming an interrupted deletion.
 *
 * A saved session carries its own target and filters, so it is turned into a
 * regular {@link RunConfig} and started through the runner like any other run.
 */

import { snowflakeToDate } from '../utils/helpers';
import type { SavedProgress } from './ports';
import { buildRunConfig, type RunConfig } from './run-config';

/**
 * Wording for the resume prompt.
 *
 * @param saved - The saved session
 * @returns A sentence naming the time, progress and target
 */
export function describeSavedSession(saved: SavedProgress): string {
  const when = new Date(saved.timestamp).toLocaleString();
  const target = saved.guildId ? `server ${saved.guildId}` : `channel ${saved.channelId ?? '?'}`;
  return `Resume deletion from ${when}? ${saved.deletedCount} of ${saved.totalFound} done, target ${target}.`;
}

/**
 * Rebuilds the run configuration a saved session was using.
 *
 * @param saved - The saved session
 * @param fallbackChannelId - Channel to use when the session recorded none
 * @param routePath - Current `location.pathname`
 * @returns The config, or null when the session has no usable target
 */
export function configForSavedSession(
  saved: SavedProgress,
  fallbackChannelId: string | null,
  routePath: string,
): RunConfig | null {
  const channelId = saved.channelId ?? fallbackChannelId;
  if (!channelId) {
    return null;
  }
  const filters = saved.filters ?? {};
  const built = buildRunConfig({
    authorId: saved.authorId,
    scope: saved.guildId ? 'server' : 'channel',
    guildId: saved.guildId ?? null,
    urlChannelId: channelId,
    routePath,
    selectedChannelIds: [],
    manualChannelId: '',
    after: filters.minId ? snowflakeToDate(filters.minId) : null,
    before: filters.maxId ? snowflakeToDate(filters.maxId) : null,
    timeRangeLabel: 'Resumed session',
    content: filters.content ?? '',
    pattern: filters.pattern ?? '',
    hasLink: filters.hasLink ?? false,
    hasFile: filters.hasFile ?? false,
    includePinned: filters.includePinned ?? false,
    deletionOrder: saved.deletionOrder,
  });
  return built.ok ? built.config : null;
}

/**
 * Storage key options for a saved session.
 *
 * @param saved - The saved session
 * @returns Guild and channel, with absent values omitted
 */
export function savedSessionTarget(saved: SavedProgress): {
  guildId?: string;
  channelId?: string;
} {
  return {
    ...(saved.guildId ? { guildId: saved.guildId } : {}),
    ...(saved.channelId ? { channelId: saved.channelId } : {}),
  };
}
