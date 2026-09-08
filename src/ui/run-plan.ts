/**
 * Multi-channel run plans.
 *
 * The engine checkpoints one channel at a time, so a saved session on its own
 * cannot say which channels a Specific run had already finished or which were
 * still queued behind the interrupted one. The runner writes a plan alongside
 * that checkpoint: the whole channel list, the filters in force and the
 * counters from the legs that already finished. Resume reads it and continues
 * the rest of the run instead of the interrupted channel alone.
 *
 * Nothing here holds a token: only the target, the filters and the counters.
 */

import { getPageStorage } from '../core/storage';
import { isValidSnowflake } from '../utils/validators';
import type { DeletionOrder } from './ports';
import type { RunConfig, TargetScope } from './run-config';

/** Prefix for every v1 run-plan entry. */
const KEY_PREFIX = 'detcord_runplan:v1:';

/** Current run-plan schema version. */
const SCHEMA_VERSION = 1;

/** Scopes a plan may record. */
const SCOPES: readonly TargetScope[] = ['channel', 'dm', 'server', 'specific'];

/** Counters carried over from the legs of a run that already finished. */
export interface RunPlanTotals {
  deleted: number;
  failed: number;
  skipped: number;
  alreadyGone: number;
}

/** The whole shape of a multi-channel run, as persisted between sessions. */
export interface RunPlan {
  version: 1;
  authorId: string;
  scope: TargetScope;
  guildId?: string;
  /** Every channel the run visits, in order. */
  channelIds: string[];
  /** Index of the channel the run had reached, 0-based. */
  index: number;
  /** Epoch milliseconds of the "after" filter, when one is set. */
  after?: number;
  /** Epoch milliseconds of the "before" filter, when one is set. */
  before?: number;
  /** Epoch milliseconds of the upper bound captured when the run was built. */
  newestAllowed: number;
  content?: string;
  pattern?: string;
  hasLink: boolean;
  hasFile: boolean;
  includePinned: boolean;
  deletionOrder: DeletionOrder;
  timeRangeLabel: string;
  completedTotals: RunPlanTotals;
  /** Epoch milliseconds when the entry was written. */
  savedAt: number;
}

/** Builds the storage key for one author's plan. */
function storageKey(authorId: string): string {
  return `${KEY_PREFIX}${authorId}`;
}

/** Whether a value is a whole number of zero or more. */
function isCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Whether a value is an epoch timestamp we are willing to trust. */
function isTimestamp(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Whether a value is a string, or absent. */
function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

/** Whether an unknown value is a Discord snowflake. */
function isSnowflakeValue(value: unknown): boolean {
  return typeof value === 'string' && isValidSnowflake(value);
}

/** Validates the four aggregate counters of a plan. */
function isValidTotals(value: unknown): value is RunPlanTotals {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const totals = value as Record<string, unknown>;
  return (
    isCount(totals.deleted) &&
    isCount(totals.failed) &&
    isCount(totals.skipped) &&
    isCount(totals.alreadyGone)
  );
}

/** Validates the target fields of a plan. */
function hasValidTarget(plan: Record<string, unknown>): boolean {
  if (!SCOPES.includes(plan.scope as TargetScope)) {
    return false;
  }
  if (plan.guildId !== undefined && !isSnowflakeValue(plan.guildId)) {
    return false;
  }
  const channelIds: unknown = plan.channelIds;
  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    return false;
  }
  if (!(channelIds as unknown[]).every(isSnowflakeValue)) {
    return false;
  }
  return isCount(plan.index) && (plan.index as number) < channelIds.length;
}

/** Validates the filter fields of a plan. */
function hasValidFilters(plan: Record<string, unknown>): boolean {
  if (plan.after !== undefined && !isTimestamp(plan.after)) {
    return false;
  }
  if (plan.before !== undefined && !isTimestamp(plan.before)) {
    return false;
  }
  if (!isTimestamp(plan.newestAllowed)) {
    return false;
  }
  if (!isOptionalString(plan.content) || !isOptionalString(plan.pattern)) {
    return false;
  }
  if (
    typeof plan.hasLink !== 'boolean' ||
    typeof plan.hasFile !== 'boolean' ||
    typeof plan.includePinned !== 'boolean'
  ) {
    return false;
  }
  if (plan.deletionOrder !== 'newest' && plan.deletionOrder !== 'oldest') {
    return false;
  }
  return typeof plan.timeRangeLabel === 'string';
}

/**
 * Runtime type check for a parsed run plan.
 *
 * @param value - Value parsed from storage
 * @returns True when the value matches the v1 plan schema
 */
export function isValidRunPlan(value: unknown): value is RunPlan {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const plan = value as Record<string, unknown>;
  if (plan.version !== SCHEMA_VERSION) {
    return false;
  }
  if (typeof plan.authorId !== 'string' || plan.authorId === '') {
    return false;
  }
  if (!hasValidTarget(plan) || !hasValidFilters(plan)) {
    return false;
  }
  return isValidTotals(plan.completedTotals) && isTimestamp(plan.savedAt);
}

/**
 * Builds the plan for a run configuration.
 *
 * @param config - The immutable config the run is using
 * @param index - Index of the channel the run has reached
 * @param completedTotals - Counters from the legs that already finished
 * @returns A plan ready to persist
 */
export function runPlanFor(
  config: RunConfig,
  index: number,
  completedTotals: RunPlanTotals,
): RunPlan {
  return {
    version: SCHEMA_VERSION,
    authorId: config.authorId,
    scope: config.scope,
    ...(config.guildId ? { guildId: config.guildId } : {}),
    channelIds: [...config.channelIds],
    index,
    ...(config.after ? { after: config.after.getTime() } : {}),
    ...(config.before ? { before: config.before.getTime() } : {}),
    newestAllowed: config.newestAllowed.getTime(),
    ...(config.content ? { content: config.content } : {}),
    ...(config.pattern ? { pattern: config.pattern } : {}),
    hasLink: config.hasLink,
    hasFile: config.hasFile,
    includePinned: config.includePinned,
    deletionOrder: config.deletionOrder,
    timeRangeLabel: config.timeRangeLabel,
    completedTotals: { ...completedTotals },
    savedAt: Date.now(),
  };
}

/**
 * Persists a run plan.
 *
 * Never throws: a run must continue even when the page refuses storage.
 *
 * @param plan - The plan to write
 */
export function saveRunPlan(plan: RunPlan): void {
  const storage = getPageStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(storageKey(plan.authorId), JSON.stringify(plan));
  } catch {
    // Quota exceeded or storage disabled; the run simply resumes one channel.
  }
}

/**
 * Loads the run plan for an author, discarding anything malformed.
 *
 * @param authorId - Confirmed Discord user ID
 * @returns The plan, or null when there is none or it fails validation
 */
export function loadRunPlan(authorId: string): RunPlan | null {
  const storage = getPageStorage();
  if (!storage) {
    return null;
  }

  const key = storageKey(authorId);
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearRunPlan(authorId);
    return null;
  }

  if (!isValidRunPlan(parsed) || parsed.authorId !== authorId) {
    clearRunPlan(authorId);
    return null;
  }
  return parsed;
}

/**
 * Removes the run plan for an author.
 *
 * @param authorId - Confirmed Discord user ID
 */
export function clearRunPlan(authorId: string): void {
  const storage = getPageStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(storageKey(authorId));
  } catch {
    // Nothing useful to do if the storage rejects the write.
  }
}
