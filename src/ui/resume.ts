/**
 * Resuming an interrupted deletion.
 *
 * A saved session carries its own target and filters, so it is turned into a
 * regular {@link RunConfig} and started through the runner like any other run.
 *
 * The engine checkpoints one channel at a time. For a multi-channel run that
 * checkpoint alone would drop every channel queued behind the interrupted one,
 * so the run plan written by the runner is consulted first: it names the whole
 * channel list, the filters in force and the counters already banked.
 *
 * A plan is only ever paired with the checkpoint of its own run. Anything less
 * would let a checkpoint adopt the channels, filters and banked counters of a
 * different run, and sweep a channel the user never reviewed for it.
 */

import { snowflakeToDate } from '../utils/helpers';
import type { SavedProgress } from './ports';
import { buildRunConfig, type RunConfig } from './run-config';
import type { RunPlan, RunPlanTotals } from './run-plan';

/** A saved session turned back into something the runner can start. */
export interface ResumePlan {
  /** The config to run, covering every channel that still has work. */
  readonly config: RunConfig;
  /** Counters from the channels that finished before the interruption. */
  readonly baseTotals: RunPlanTotals | null;
  /** Messages the interrupted run's review step counted, when it is known. */
  readonly expectedTotal: number | null;
}

/**
 * Whether a plan describes the very run a checkpoint belongs to.
 *
 * The run ID, the account and the channel the plan says the run had reached
 * must all agree. A plan that merely mentions the channel somewhere in its
 * list belongs to some other run and is not usable here.
 *
 * @param plan - The persisted run plan
 * @param saved - The saved session
 * @returns True when the plan may be used to resume this session
 */
export function runPlanApplies(plan: RunPlan, saved: SavedProgress): boolean {
  return (
    plan.runId === saved.runId &&
    plan.authorId === saved.authorId &&
    saved.channelId !== undefined &&
    plan.channelIds[plan.index] === saved.channelId
  );
}

/** Names the target a saved session was working on. */
function describeTarget(saved: SavedProgress): string {
  return saved.guildId ? `server ${saved.guildId}` : `channel ${saved.channelId ?? '?'}`;
}

/**
 * Wording for the resume prompt.
 *
 * The sentence must name the scope resuming would actually sweep, so a user
 * can never accept a resume that covers more channels than it says.
 *
 * @param saved - The saved session
 * @param plan - The persisted run plan for this author, when there is one
 * @returns A sentence naming the time, progress and scope
 */
export function describeSavedSession(saved: SavedProgress, plan?: RunPlan | null): string {
  const when = new Date(saved.timestamp).toLocaleString();
  const progress = `${saved.deletedCount} of ${saved.totalFound} done in ${describeTarget(saved)}`;
  const queued = plan && runPlanApplies(plan, saved) ? plan.channelIds.length - plan.index - 1 : 0;
  if (queued <= 0) {
    return `Resume the deletion from ${when}? ${progress}.`;
  }
  const channels = queued === 1 ? '1 more channel' : `${queued} more channels`;
  return `Resume the deletion from ${when}? ${progress}, then ${channels}.`;
}

/**
 * Rebuilds the remainder of a multi-channel run from its plan.
 *
 * @param plan - The persisted run plan
 * @param saved - The saved session the plan should cover
 * @param routePath - Current `location.pathname`
 * @returns The config for the interrupted channel and every channel after it,
 *   or null when the plan does not cover this session
 */
function configFromPlan(plan: RunPlan, saved: SavedProgress, routePath: string): RunConfig | null {
  if (!runPlanApplies(plan, saved)) {
    return null;
  }
  const channels = plan.channelIds.slice(plan.index);
  const built = buildRunConfig({
    authorId: plan.authorId,
    scope: plan.scope,
    guildId: plan.guildId ?? null,
    urlChannelId: channels[0] ?? null,
    routePath,
    selectedChannelIds: plan.scope === 'specific' ? channels : [],
    manualChannelId: '',
    after: plan.after === undefined ? null : new Date(plan.after),
    before: plan.before === undefined ? null : new Date(plan.before),
    newestAllowed: new Date(plan.newestAllowed),
    timeRangeLabel: plan.timeRangeLabel,
    content: plan.content ?? '',
    pattern: plan.pattern ?? '',
    hasLink: plan.hasLink,
    hasFile: plan.hasFile,
    includePinned: plan.includePinned,
    deletionOrder: plan.deletionOrder,
  });
  return built.ok ? built.config : null;
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
  // The saved `maxId` is the upper bound the original run was given, so it is
  // reused rather than replaced with a fresh "now".
  const upperBound = filters.maxId ? snowflakeToDate(filters.maxId) : null;
  const built = buildRunConfig({
    authorId: saved.authorId,
    scope: saved.guildId ? 'server' : 'channel',
    guildId: saved.guildId ?? null,
    urlChannelId: channelId,
    routePath,
    selectedChannelIds: [],
    manualChannelId: '',
    after: filters.minId ? snowflakeToDate(filters.minId) : null,
    before: upperBound,
    newestAllowed: upperBound,
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
 * Turns a saved session into something the runner can start.
 *
 * The run plan wins when it covers the saved session, so every channel still
 * queued behind the interrupted one is swept and the counters from the
 * channels that already finished are carried into the resumed run.
 *
 * @param saved - The saved session
 * @param fallbackChannelId - Channel to use when the session recorded none
 * @param routePath - Current `location.pathname`
 * @param plan - The persisted run plan for this author, when there is one
 * @returns The config and any counters to carry over, or null when the session
 *   has no usable target
 */
export function resumePlanFor(
  saved: SavedProgress,
  fallbackChannelId: string | null,
  routePath: string,
  plan?: RunPlan | null,
): ResumePlan | null {
  if (plan) {
    const planned = configFromPlan(plan, saved, routePath);
    if (planned) {
      return {
        config: planned,
        baseTotals: plan.completedTotals,
        expectedTotal: plan.expectedTotal ?? null,
      };
    }
  }
  const config = configForSavedSession(saved, fallbackChannelId, routePath);
  return config ? { config, baseTotals: null, expectedTotal: null } : null;
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
