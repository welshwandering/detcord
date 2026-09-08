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
 * A plan belongs to exactly one run. It carries that run's ID and is filed
 * under it, so two runs for the same account - two tabs, or a second run
 * started after a Stop - can neither overwrite nor adopt each other's plan.
 *
 * Nothing here holds a token: only the target, the filters and the counters.
 */

import { getPageStorage } from '../core/storage';
import { isValidSnowflake } from '../utils/validators';
import type { DeletionOrder } from './ports';
import type { RunConfig, TargetScope } from './run-config';

/** Prefix for every v2 run-plan entry. */
const KEY_PREFIX = 'detcord_runplan:v2:';

/** Prefix of the v1 entries, which were keyed by author alone. */
const LEGACY_KEY_PREFIX = 'detcord_runplan:v1:';

/** Current run-plan schema version. */
const SCHEMA_VERSION = 2;

/** How long a plan stays usable, matching the checkpoint expiry. */
const PLAN_TTL_MS = 24 * 60 * 60 * 1000;

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
  version: 2;
  /** The run this plan belongs to, matching the checkpoint's `runId`. */
  runId: string;
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
  /** Messages the review step counted across every channel of the run. */
  expectedTotal?: number;
  /** Epoch milliseconds when the entry was written. */
  savedAt: number;
}

/** What a plan needs to know beyond the config it was built from. */
export interface RunPlanInput {
  /** The run this plan belongs to. */
  runId: string;
  /** Index of the channel the run has reached. */
  index: number;
  /** Counters from the legs that already finished. */
  completedTotals: RunPlanTotals;
  /** Aggregate the review step showed, or null when there was none. */
  expectedTotal: number | null;
}

/** Builds the storage key for one run's plan. */
function storageKey(authorId: string, runId: string): string {
  return `${KEY_PREFIX}${authorId}:${runId}`;
}

/** Removes the v1 entry for an author, which no reader here understands. */
function removeLegacyPlan(storage: Storage, authorId: string): void {
  try {
    storage.removeItem(`${LEGACY_KEY_PREFIX}${authorId}`);
  } catch {
    // Nothing useful to do if the storage rejects the removal.
  }
}

/** Whether a plan is older than {@link PLAN_TTL_MS}. */
function isExpired(plan: RunPlan, now: number): boolean {
  return now - plan.savedAt > PLAN_TTL_MS;
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

/** Validates the identity a plan must carry to be paired with a checkpoint. */
function hasValidIdentity(plan: Record<string, unknown>): boolean {
  if (plan.version !== SCHEMA_VERSION) {
    return false;
  }
  if (typeof plan.authorId !== 'string' || plan.authorId === '') {
    return false;
  }
  if (typeof plan.runId !== 'string' || plan.runId === '') {
    return false;
  }
  return plan.expectedTotal === undefined || isCount(plan.expectedTotal);
}

/**
 * Runtime type check for a parsed run plan.
 *
 * @param value - Value parsed from storage
 * @returns True when the value matches the v2 plan schema
 */
export function isValidRunPlan(value: unknown): value is RunPlan {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const plan = value as Record<string, unknown>;
  if (!hasValidIdentity(plan) || !hasValidTarget(plan) || !hasValidFilters(plan)) {
    return false;
  }
  return isValidTotals(plan.completedTotals) && isTimestamp(plan.savedAt);
}

/**
 * Builds the plan for a run configuration.
 *
 * @param config - The immutable config the run is using
 * @param input - The run's identity, position and banked counters
 * @returns A plan ready to persist
 */
export function runPlanFor(config: RunConfig, input: RunPlanInput): RunPlan {
  return {
    version: SCHEMA_VERSION,
    runId: input.runId,
    authorId: config.authorId,
    scope: config.scope,
    ...(config.guildId ? { guildId: config.guildId } : {}),
    channelIds: [...config.channelIds],
    index: input.index,
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
    completedTotals: { ...input.completedTotals },
    ...(input.expectedTotal === null ? {} : { expectedTotal: input.expectedTotal }),
    savedAt: Date.now(),
  };
}

/**
 * Persists a run plan under its own run ID.
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
  removeLegacyPlan(storage, plan.authorId);
  try {
    storage.setItem(storageKey(plan.authorId, plan.runId), JSON.stringify(plan));
  } catch {
    // Quota exceeded or storage disabled; the run simply resumes one channel.
  }
}

/**
 * Loads the plan for one run, discarding anything malformed or expired.
 *
 * @param authorId - Confirmed Discord user ID
 * @param runId - The run whose plan is wanted
 * @returns The plan, or null when there is none or it fails validation
 */
export function loadRunPlan(authorId: string, runId: string): RunPlan | null {
  const storage = getPageStorage();
  if (!storage) {
    return null;
  }
  removeLegacyPlan(storage, authorId);

  let raw: string | null;
  try {
    raw = storage.getItem(storageKey(authorId, runId));
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
    clearRunPlan(authorId, runId);
    return null;
  }

  if (!isValidRunPlan(parsed) || parsed.authorId !== authorId || parsed.runId !== runId) {
    clearRunPlan(authorId, runId);
    return null;
  }
  if (isExpired(parsed, Date.now())) {
    clearRunPlan(authorId, runId);
    return null;
  }
  return parsed;
}

/**
 * Removes the plan for one run.
 *
 * @param authorId - Confirmed Discord user ID
 * @param runId - The run whose plan should go
 */
export function clearRunPlan(authorId: string, runId: string): void {
  const storage = getPageStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(storageKey(authorId, runId));
  } catch {
    // Nothing useful to do if the storage rejects the write.
  }
}

/** Lists the plan keys stored for one author. */
function planKeysFor(storage: Storage, authorId: string): string[] {
  const prefix = `${KEY_PREFIX}${authorId}:`;
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }
  } catch {
    return [];
  }
  return keys;
}

/** Whether the entry at a key is a plan still worth keeping. */
function isLivePlanEntry(storage: Storage, key: string, now: number): boolean {
  let parsed: unknown;
  try {
    const raw = storage.getItem(key);
    if (raw === null) {
      return false;
    }
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  return isValidRunPlan(parsed) && !isExpired(parsed, now);
}

/**
 * Removes every stale plan for an author.
 *
 * Plans are filed per run, so without a sweep the entries of runs that were
 * never resumed would accumulate for as long as the storage lives.
 *
 * @param authorId - Confirmed Discord user ID
 */
export function pruneRunPlans(authorId: string): void {
  const storage = getPageStorage();
  if (!storage) {
    return;
  }
  removeLegacyPlan(storage, authorId);

  const now = Date.now();
  for (const key of planKeysFor(storage, authorId)) {
    if (isLivePlanEntry(storage, key, now)) {
      continue;
    }
    try {
      storage.removeItem(key);
    } catch {
      // Nothing useful to do if the storage rejects the removal.
    }
  }
}
