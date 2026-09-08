/**
 * Session persistence for Detcord.
 *
 * Discord's web client deletes `window.localStorage` from its own window, so
 * every direct `localStorage.*` call throws. All access goes through
 * `getPageStorage()`, which falls back to a same-origin iframe.
 *
 * Progress is stored per author and per deletion target so that a run in one
 * server cannot clobber the saved cursor of a run in another.
 */

import { getPageStorage } from './storage';

// =============================================================================
// Constants
// =============================================================================

/** Prefix for every v2 progress entry. */
const KEY_PREFIX = 'detcord_progress:v2:';

/** The v1 key, written by releases before per-target progress existed. */
const LEGACY_KEY = 'detcord_progress';

/** Expiry for saved progress in milliseconds (24 hours). */
const PROGRESS_EXPIRY_MS = 24 * 60 * 60 * 1000;

/** Number of deletions between automatic saves. */
const SAVE_INTERVAL = 10;

/** Current schema version. */
const SCHEMA_VERSION = 2;

// =============================================================================
// Types
// =============================================================================

/** Filter state carried across a resume. */
export interface SavedFilters {
  /** Text content filter passed to Discord's search. */
  content?: string;
  /** Filter for messages containing links. */
  hasLink?: boolean;
  /** Filter for messages containing file attachments. */
  hasFile?: boolean;
  /** Whether pinned messages were included. */
  includePinned?: boolean;
  /** Client-side regex pattern. */
  pattern?: string;
  /** Minimum message ID ("after" date filter). */
  minId?: string;
  /** Maximum message ID ("before" date filter). */
  maxId?: string;
}

/** Saved progress for one deletion run. */
export interface SavedProgress {
  /** Schema version; always 2 for entries written by this module. */
  version: 2;
  /** Identifier for the run, so a resumed run can be correlated in logs. */
  runId: string;
  /** ID of the message author (the current user). */
  authorId: string;
  /** Guild (server) ID for a server-wide run. */
  guildId?: string;
  /** Channel ID for a channel-specific run. */
  channelId?: string;
  /** Direction the run was deleting in. */
  deletionOrder: 'newest' | 'oldest';
  /**
   * Where to pick the run back up.
   *
   * Newest-first runs store `maxId` (search strictly older than this next).
   * Oldest-first runs store `minId` (search strictly newer than this next).
   */
  cursor: { maxId?: string; minId?: string };
  /** Messages successfully deleted. */
  deletedCount: number;
  /** Messages that failed to delete. */
  failedCount: number;
  /** Messages skipped (pinned, foreign, undeletable type, forbidden). */
  skippedCount: number;
  /** Messages that were already gone when the delete was attempted. */
  alreadyGoneCount: number;
  /** Latest `total_results` reported by search. */
  totalFound: number;
  /** `total_results` of the first search of the run. */
  initialTotalFound: number;
  /** Epoch milliseconds when the entry was written. */
  timestamp: number;
  /** Filter state at the time of the save. */
  filters?: SavedFilters;
}

// =============================================================================
// Key helpers
// =============================================================================

/**
 * Builds the target portion of a storage key.
 *
 * A guild ID wins over a channel ID because a guild-wide search ignores the
 * channel, and the two runs must not share a cursor.
 *
 * @param opts - The guild and/or channel the run targets
 * @returns `g:<guildId>`, `c:<channelId>`, or `all` when neither is set
 */
export function targetKeyFor(opts: { guildId?: string; channelId?: string }): string {
  if (opts.guildId) {
    return `g:${opts.guildId}`;
  }
  if (opts.channelId) {
    return `c:${opts.channelId}`;
  }
  return 'all';
}

/** Builds the full storage key for an author/target pair. */
function storageKey(authorId: string, targetKey: string): string {
  return `${KEY_PREFIX}${authorId}:${targetKey}`;
}

/** Removes the v1 entry if it is still present. */
function removeLegacyEntry(storage: Storage): void {
  try {
    if (storage.getItem(LEGACY_KEY) !== null) {
      storage.removeItem(LEGACY_KEY);
    }
  } catch {
    // A storage that refuses reads cannot hold a legacy entry we care about.
  }
}

// =============================================================================
// Validation
// =============================================================================

/** Checks that every value in an array is a finite number. */
function allFiniteNumbers(values: unknown[]): boolean {
  return values.every((value) => typeof value === 'number' && Number.isFinite(value));
}

/** Validates the optional `filters` object of a saved entry. */
function isValidFilters(value: unknown): value is SavedFilters {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const filters = value as Record<string, unknown>;
  const strings = ['content', 'pattern', 'minId', 'maxId'] as const;
  const booleans = ['hasLink', 'hasFile', 'includePinned'] as const;

  for (const key of strings) {
    if (filters[key] !== undefined && typeof filters[key] !== 'string') {
      return false;
    }
  }
  for (const key of booleans) {
    if (filters[key] !== undefined && typeof filters[key] !== 'boolean') {
      return false;
    }
  }
  return true;
}

/** Validates the `cursor` object of a saved entry. */
function isValidCursor(value: unknown): value is SavedProgress['cursor'] {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const cursor = value as Record<string, unknown>;
  if (cursor.maxId !== undefined && typeof cursor.maxId !== 'string') {
    return false;
  }
  if (cursor.minId !== undefined && typeof cursor.minId !== 'string') {
    return false;
  }
  return true;
}

/**
 * Validates the identity fields of a saved entry.
 *
 * @param obj - Parsed entry
 * @returns True when version, run, author, order and target are all sound
 */
function hasValidIdentity(obj: Record<string, unknown>): boolean {
  if (obj.version !== SCHEMA_VERSION) {
    return false;
  }
  if (typeof obj.runId !== 'string' || obj.runId === '') {
    return false;
  }
  if (typeof obj.authorId !== 'string' || obj.authorId === '') {
    return false;
  }
  if (obj.deletionOrder !== 'newest' && obj.deletionOrder !== 'oldest') {
    return false;
  }
  if (obj.guildId !== undefined && typeof obj.guildId !== 'string') {
    return false;
  }
  return obj.channelId === undefined || typeof obj.channelId === 'string';
}

/**
 * Runtime type check for a parsed v2 progress entry.
 *
 * @param data - Value parsed from storage
 * @returns True when the value matches the v2 schema
 */
export function isValidProgressData(data: unknown): data is SavedProgress {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;

  if (!hasValidIdentity(obj)) {
    return false;
  }
  if (!isValidCursor(obj.cursor)) {
    return false;
  }
  if (
    !allFiniteNumbers([
      obj.deletedCount,
      obj.failedCount,
      obj.skippedCount,
      obj.alreadyGoneCount,
      obj.totalFound,
      obj.initialTotalFound,
      obj.timestamp,
    ])
  ) {
    return false;
  }
  return obj.filters === undefined || isValidFilters(obj.filters);
}

// =============================================================================
// Read / write
// =============================================================================

/**
 * Reads and validates one entry, removing it when malformed or expired.
 *
 * @param storage - The page storage to read from
 * @param key - Full storage key
 * @returns The entry, or null when absent, malformed or expired
 */
function readEntry(storage: Storage, key: string): SavedProgress | null {
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
    removeKey(storage, key);
    return null;
  }

  if (!isValidProgressData(parsed)) {
    removeKey(storage, key);
    return null;
  }

  if (Date.now() - parsed.timestamp > PROGRESS_EXPIRY_MS) {
    removeKey(storage, key);
    return null;
  }

  return parsed;
}

/** Removes a key, swallowing storage failures. */
function removeKey(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing useful to do if the storage rejects the write.
  }
}

/**
 * Saves deletion progress.
 *
 * Never throws: a userscript cannot usefully report a storage failure, and the
 * run must continue without resume support.
 *
 * @param progress - The progress state to persist
 */
export function saveProgress(progress: SavedProgress): void {
  const storage = getPageStorage();
  if (!storage) {
    return;
  }
  removeLegacyEntry(storage);
  try {
    storage.setItem(
      storageKey(progress.authorId, targetKeyFor(progress)),
      JSON.stringify(progress),
    );
  } catch {
    // Quota exceeded or storage disabled; resume simply will not be offered.
  }
}

/**
 * Loads saved progress for one author/target pair.
 *
 * @param authorId - The current user's ID
 * @param targetKey - Key from {@link targetKeyFor}
 * @returns The saved progress, or null when missing, malformed or expired
 */
export function loadProgress(authorId: string, targetKey: string): SavedProgress | null {
  const storage = getPageStorage();
  if (!storage) {
    return null;
  }
  removeLegacyEntry(storage);
  return readEntry(storage, storageKey(authorId, targetKey));
}

/**
 * Finds the most recent resumable session for an author across all targets.
 *
 * Malformed and expired entries are removed as a side effect.
 *
 * @param authorId - The current user's ID
 * @returns The newest non-expired entry, or null when there is none
 */
export function findResumableSession(authorId: string): SavedProgress | null {
  const storage = getPageStorage();
  if (!storage) {
    return null;
  }
  removeLegacyEntry(storage);

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
    return null;
  }

  let newest: SavedProgress | null = null;
  for (const key of keys) {
    const entry = readEntry(storage, key);
    if (entry && (newest === null || entry.timestamp > newest.timestamp)) {
      newest = entry;
    }
  }
  return newest;
}

/**
 * Clears saved progress for one author/target pair.
 *
 * @param authorId - The current user's ID
 * @param targetKey - Key from {@link targetKeyFor}
 */
export function clearProgress(authorId: string, targetKey: string): void {
  const storage = getPageStorage();
  if (!storage) {
    return;
  }
  removeLegacyEntry(storage);
  removeKey(storage, storageKey(authorId, targetKey));
}

// =============================================================================
// Save scheduling
// =============================================================================

/**
 * Returns how many further deletions are needed before the next auto-save.
 *
 * @param deletedCount - Current number of deleted messages
 * @returns A value between 1 and {@link SAVE_INTERVAL}
 */
export function getDeletionsUntilSave(deletedCount: number): number {
  return SAVE_INTERVAL - (deletedCount % SAVE_INTERVAL);
}

/**
 * Whether progress should be auto-saved at this deletion count.
 *
 * @param deletedCount - Current number of deleted messages
 * @returns True every {@link SAVE_INTERVAL} deletions
 */
export function shouldSaveProgress(deletedCount: number): boolean {
  return deletedCount > 0 && deletedCount % SAVE_INTERVAL === 0;
}
