/**
 * Wizard state and form binding.
 *
 * The wizard owns everything the user picks before a run starts. State and DOM
 * are kept in step through a single `applyWizardState` / `resetWizardState`
 * pair, so "Try again" can never leave a toggle switched on while the state
 * behind it says otherwise.
 */

import { getChannelIdFromUrl } from '../core/token';
import {
  parseLocalDateEnd as parseLocalDateEndStrict,
  parseLocalDateStart as parseLocalDateStartStrict,
} from '../utils/helpers';
import { validateRegex } from '../utils/validators';
import { channelNameFromDom } from './channel-picker';
import { SHOW_OLDEST_FIRST } from './constants';
import type { DeletionOrder } from './ports';
import type { TargetScope } from './run-config';

/** Local midnight for a `YYYY-MM-DD` value, or null when it is not a real date. */
function parseLocalDateStart(value: string): Date | null {
  try {
    return parseLocalDateStartStrict(value);
  } catch {
    return null;
  }
}

/** Last instant of a `YYYY-MM-DD` day, or null when it is not a real date. */
function parseLocalDateEnd(value: string): Date | null {
  try {
    return parseLocalDateEndStrict(value);
  } catch {
    return null;
  }
}

/** Wizard steps, in order. */
export const WIZARD_STEPS = ['location', 'timerange', 'filters', 'review'] as const;

/** A single wizard step. */
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Identifiers for the time range presets offered in step 2. */
export type TimeRangeId = 'all' | '24h' | '72h' | '30d' | 'older-30d' | 'older-90d' | 'custom';

/** Human labels for each time range preset. */
export const TIME_RANGE_LABELS: Record<TimeRangeId, string> = {
  all: 'Everything',
  '24h': 'Last 24 hours',
  '72h': 'Last 3 days',
  '30d': 'Last 30 days',
  'older-30d': 'Older than 30 days',
  'older-90d': 'Older than 90 days',
  custom: 'Custom range',
};

/** Mid-sentence wording for each preset, used by the summary line. */
const TIME_RANGE_SUMMARY: Record<TimeRangeId, string> = {
  all: 'all time',
  '24h': 'last 24 hours',
  '72h': 'last 3 days',
  '30d': 'last 30 days',
  'older-30d': 'older than 30 days',
  'older-90d': 'older than 90 days',
  custom: 'custom range',
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Offsets applied to "now" for the relative presets, in milliseconds. */
const RELATIVE_PRESETS: Partial<Record<TimeRangeId, { after?: number; before?: number }>> = {
  '24h': { after: 24 * HOUR_MS },
  '72h': { after: 72 * HOUR_MS },
  '30d': { after: 30 * DAY_MS },
  'older-30d': { before: 30 * DAY_MS },
  'older-90d': { before: 90 * DAY_MS },
};

/**
 * Whether a preset resolves against an instant rather than entered dates.
 *
 * @param id - The preset the user picked
 * @returns True when the preset is measured back from a moment in time
 */
export function isRelativeTimeRange(id: TimeRangeId): boolean {
  return RELATIVE_PRESETS[id] !== undefined;
}

/** Mutable state behind the wizard screens. */
export interface WizardState {
  stepIndex: number;
  target: TargetScope;
  timeRange: TimeRangeId;
  /**
   * Epoch milliseconds the relative preset was picked at, or null.
   *
   * "Older than 30 days" names a boundary the user saw when they chose it, so
   * it is pinned there. Resolving it at review instead would widen the range
   * by however long they spent on the remaining steps.
   */
  rangeSelectedAt: number | null;
  /** Raw text of the custom "from" date input (`YYYY-MM-DD`). */
  customAfter: string;
  /** Raw text of the custom "to" date input (`YYYY-MM-DD`). */
  customBefore: string;
  content: string;
  pattern: string;
  hasLink: boolean;
  hasFile: boolean;
  includePinned: boolean;
  deletionOrder: DeletionOrder;
  selectedChannels: Set<string>;
  manualChannelId: string;
}

/** A resolved time range, or the reason it could not be resolved. */
export type TimeRangeResult =
  | { readonly ok: true; readonly after: Date | null; readonly before: Date | null }
  | { readonly ok: false; readonly error: string };

/**
 * Creates wizard state with every control in its default position.
 *
 * @returns A fresh state object
 */
export function createWizardState(): WizardState {
  return {
    stepIndex: 0,
    target: 'channel',
    timeRange: 'all',
    rangeSelectedAt: null,
    customAfter: '',
    customBefore: '',
    content: '',
    pattern: '',
    hasLink: false,
    hasFile: false,
    includePinned: false,
    deletionOrder: 'newest',
    selectedChannels: new Set<string>(),
    manualChannelId: '',
  };
}

/**
 * Resolves a custom date range entered by hand.
 *
 * @param afterText - Raw "from" text
 * @param beforeText - Raw "to" text
 * @returns The resolved range, or a validation error
 */
function resolveCustomRange(afterText: string, beforeText: string): TimeRangeResult {
  const after = afterText ? parseLocalDateStart(afterText) : null;
  const before = beforeText ? parseLocalDateEnd(beforeText) : null;

  if (afterText && !after) {
    return { ok: false, error: 'The "from" date is not a valid date.' };
  }
  if (beforeText && !before) {
    return { ok: false, error: 'The "to" date is not a valid date.' };
  }
  if (!after && !before) {
    return { ok: false, error: 'Enter at least one date, or choose another range.' };
  }
  return { ok: true, after, before };
}

/**
 * Resolves the selected time range to concrete instants.
 *
 * A relative preset is measured back from the moment it was selected, which
 * `rangeSelectedAt` records; `now` is only the fallback for state that has no
 * such instant. Nothing is round-tripped through an `<input type="date">`, so
 * "Last 24 hours" covers exactly 24 hours.
 *
 * @param state - Current wizard state
 * @param now - Reference instant, normally `new Date()`
 * @returns The resolved range, or a validation error
 */
export function resolveTimeRange(state: WizardState, now: Date): TimeRangeResult {
  if (state.timeRange === 'custom') {
    return resolveCustomRange(state.customAfter.trim(), state.customBefore.trim());
  }

  const offsets = RELATIVE_PRESETS[state.timeRange];
  if (!offsets) {
    return { ok: true, after: null, before: null };
  }
  const from = state.rangeSelectedAt ?? now.getTime();
  return {
    ok: true,
    after: offsets.after === undefined ? null : new Date(from - offsets.after),
    before: offsets.before === undefined ? null : new Date(from - offsets.before),
  };
}

/**
 * Validates the regex pattern currently entered.
 *
 * @param state - Current wizard state
 * @returns The error message, or null when the pattern is acceptable
 */
export function validatePatternInput(state: WizardState): string | null {
  const pattern = state.pattern.trim();
  if (!pattern) {
    return null;
  }
  const result = validateRegex(pattern);
  return result.valid ? null : (result.error ?? 'Invalid regex pattern.');
}

function inputEl(root: ParentNode, name: string): HTMLInputElement | null {
  return root.querySelector<HTMLInputElement>(`[data-input="${name}"]`);
}

/** What the summary line needs to know that wizard state cannot tell it. */
export interface WizardSummaryContext {
  /** Channel the page is on, when Detcord can see one. */
  currentChannelId?: string | null;
  /** Resolves a channel ID to its Discord name, when something knows it. */
  channelName?: (id: string) => string | undefined;
}

/** Longest filter text quoted in the summary line before it is cut short. */
const MAX_SUMMARY_FILTER_LENGTH = 24;

function shorten(text: string): string {
  return text.length > MAX_SUMMARY_FILTER_LENGTH
    ? `${text.slice(0, MAX_SUMMARY_FILTER_LENGTH)}\u2026`
    : text;
}

function channelRef(id: string | null | undefined, ctx: WizardSummaryContext): string {
  if (!id) {
    return 'this channel';
  }
  const name = ctx.channelName?.(id)?.trim();
  return name ? `#${name}` : id;
}

function describeSelectedChannels(state: WizardState, ctx: WizardSummaryContext): string {
  const ids = [...state.selectedChannels];
  const manual = state.manualChannelId.trim();
  if (manual && !ids.includes(manual)) {
    ids.push(manual);
  }
  if (ids.length === 0) {
    return 'no channels picked';
  }
  return ids.length === 1 ? channelRef(ids[0], ctx) : `${ids.length} channels`;
}

function describeSummaryTarget(state: WizardState, ctx: WizardSummaryContext): string {
  if (state.target === 'dm') {
    return 'this DM';
  }
  if (state.target === 'server') {
    return 'every channel in this server';
  }
  if (state.target === 'specific') {
    return describeSelectedChannels(state, ctx);
  }
  return channelRef(ctx.currentChannelId, ctx);
}

function describeSummaryRange(state: WizardState): string {
  if (state.timeRange !== 'custom') {
    return TIME_RANGE_SUMMARY[state.timeRange];
  }
  const after = state.customAfter.trim();
  const before = state.customBefore.trim();
  if (after && before) {
    return `${after} to ${before}`;
  }
  if (after) {
    return `after ${after}`;
  }
  return before ? `before ${before}` : TIME_RANGE_SUMMARY.custom;
}

function describeSummaryFilters(state: WizardState): string {
  const parts: string[] = [];
  const content = state.content.trim();
  const pattern = state.pattern.trim();
  if (content) {
    parts.push(`containing "${shorten(content)}"`);
  }
  if (pattern) {
    parts.push(`matching /${shorten(pattern)}/`);
  }
  if (state.hasLink) {
    parts.push('with links');
  }
  if (state.hasFile) {
    parts.push('with attachments');
  }
  parts.push(state.includePinned ? 'pinned included' : 'pinned kept');
  return parts.join(', ');
}

/**
 * Describes the whole wizard selection in one line.
 *
 * The line sits under the step indicator for the length of the wizard, so a
 * choice made on step one is still visible on step four.
 *
 * @param state - Current wizard state
 * @param ctx - What the caller knows about channels
 * @returns A line such as "#general \u00B7 last 30 days \u00B7 with links, pinned kept"
 */
export function describeWizardSummary(state: WizardState, ctx: WizardSummaryContext = {}): string {
  return [
    describeSummaryTarget(state, ctx),
    describeSummaryRange(state),
    describeSummaryFilters(state),
  ].join(' \u00B7 ');
}

/**
 * Looks a channel name up from the rendered picker rows.
 *
 * @param root - Element containing the wizard markup
 * @returns A context resolving names and the channel the page is on
 */
function defaultSummaryContext(root: ParentNode): WizardSummaryContext {
  let currentChannelId: string | null = null;
  try {
    currentChannelId = getChannelIdFromUrl();
  } catch {
    currentChannelId = null;
  }
  return {
    currentChannelId,
    channelName: (id) => channelNameFromDom(root, id),
  };
}

/**
 * Copies the free-text inputs from the DOM into wizard state.
 *
 * Toggles, cards and radios update state on click, but text inputs are only
 * read when we need them.
 *
 * @param state - State to update in place
 * @param root - Element containing the wizard markup
 */
export function readWizardInputs(state: WizardState, root: ParentNode): void {
  state.customAfter = inputEl(root, 'afterDate')?.value.trim() ?? '';
  state.customBefore = inputEl(root, 'beforeDate')?.value.trim() ?? '';
  state.content = inputEl(root, 'contentFilter')?.value.trim() ?? '';
  state.pattern = inputEl(root, 'pattern')?.value.trim() ?? '';
  state.manualChannelId = inputEl(root, 'manualChannelId')?.value.trim() ?? '';
}

function setSelected(root: ParentNode, selector: string, attribute: string, value: string): void {
  for (const el of root.querySelectorAll(selector)) {
    const on = el.getAttribute(attribute) === value;
    el.classList.toggle('selected', on);
    if (el.getAttribute('role') === 'radio') {
      el.setAttribute('aria-checked', String(on));
    }
  }
}

/**
 * Writes only the summary line, for changes that must not rewrite the inputs
 * (typing in a text filter, flipping a toggle, picking a channel).
 *
 * @param state - Current wizard state
 * @param root - Element containing the wizard markup
 * @param ctx - Names and current channel for the summary; defaults from the DOM
 */
export function writeWizardSummary(
  state: WizardState,
  root: ParentNode,
  ctx?: WizardSummaryContext,
): void {
  const summary = root.querySelector<HTMLElement>('[data-bind="wizardSummary"]');
  if (summary) {
    summary.textContent = describeWizardSummary(state, ctx ?? defaultSummaryContext(root));
  }
}

/**
 * Writes wizard state onto the DOM controls.
 *
 * @param state - State to render
 * @param root - Element containing the wizard markup
 * @param ctx - What the caller knows about channels, for the summary line
 */
export function applyWizardState(
  state: WizardState,
  root: ParentNode,
  ctx?: WizardSummaryContext,
): void {
  setSelected(root, '[data-action="selectTarget"]', 'data-target', state.target);
  setSelected(root, '[data-action="selectTimeRange"]', 'data-timerange', state.timeRange);

  for (const toggle of root.querySelectorAll('[data-action="toggleFilter"]')) {
    const key = toggle.getAttribute('data-toggle');
    const on = key !== null && isFilterOn(state, key);
    toggle.classList.toggle('on', on);
    toggle.setAttribute('aria-checked', String(on));
  }

  const setInput = (name: string, value: string): void => {
    const el = inputEl(root, name);
    if (el) {
      el.value = value;
    }
  };
  setInput('afterDate', state.customAfter);
  setInput('beforeDate', state.customBefore);
  setInput('contentFilter', state.content);
  setInput('pattern', state.pattern);
  setInput('manualChannelId', state.manualChannelId);
  setInput('channelSearch', '');

  for (const radio of root.querySelectorAll<HTMLInputElement>('input[name="deletionOrder"]')) {
    radio.checked = radio.value === state.deletionOrder;
  }

  toggleVisible(root, '[data-bind="channelPicker"]', state.target === 'specific');
  toggleVisible(root, '[data-bind="manualIdContainer"]', state.target === 'specific');
  toggleVisible(root, '[data-bind="dateRangeContainer"]', state.timeRange === 'custom');
  toggleVisible(root, '[data-bind="deletionOrderGroup"]', SHOW_OLDEST_FIRST);

  writeWizardSummary(state, root, ctx);
}

function toggleVisible(root: ParentNode, selector: string, visible: boolean): void {
  root.querySelector(selector)?.classList.toggle('visible', visible);
}

/**
 * Reads a named filter toggle out of state.
 *
 * @param state - Current wizard state
 * @param key - Toggle name from `data-toggle`
 * @returns Whether that toggle is on
 */
export function isFilterOn(state: WizardState, key: string): boolean {
  if (key === 'hasLink') return state.hasLink;
  if (key === 'hasFile') return state.hasFile;
  if (key === 'includePinned') return state.includePinned;
  return false;
}

/**
 * Flips a named filter toggle in state.
 *
 * @param state - State to update in place
 * @param key - Toggle name from `data-toggle`
 * @returns The new value, or null when the name is unknown
 */
export function toggleFilter(state: WizardState, key: string): boolean | null {
  if (key === 'hasLink') {
    state.hasLink = !state.hasLink;
    return state.hasLink;
  }
  if (key === 'hasFile') {
    state.hasFile = !state.hasFile;
    return state.hasFile;
  }
  if (key === 'includePinned') {
    state.includePinned = !state.includePinned;
    return state.includePinned;
  }
  return null;
}

/**
 * Resets wizard state and the DOM controls together.
 *
 * This is the only supported way to clear the wizard: doing state and DOM in
 * one call is what stops "Try again" from leaving switches on while the
 * filters behind them are gone.
 *
 * @param state - State to reset in place
 * @param root - Element containing the wizard markup
 * @param ctx - What the caller knows about channels, for the summary line
 */
export function resetWizardState(
  state: WizardState,
  root: ParentNode,
  ctx?: WizardSummaryContext,
): void {
  const fresh = createWizardState();
  state.stepIndex = fresh.stepIndex;
  state.target = fresh.target;
  state.timeRange = fresh.timeRange;
  state.rangeSelectedAt = fresh.rangeSelectedAt;
  state.customAfter = fresh.customAfter;
  state.customBefore = fresh.customBefore;
  state.content = fresh.content;
  state.pattern = fresh.pattern;
  state.hasLink = fresh.hasLink;
  state.hasFile = fresh.hasFile;
  state.includePinned = fresh.includePinned;
  state.deletionOrder = fresh.deletionOrder;
  state.selectedChannels.clear();
  state.manualChannelId = fresh.manualChannelId;
  applyWizardState(state, root, ctx);
}
