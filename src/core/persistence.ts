/**
 * Persistence module for Detcord
 *
 * Provides localStorage-based persistence for deletion progress,
 * allowing users to resume interrupted deletion sessions.
 */

import { isValidSnowflake } from '../utils/validators';

// =============================================================================
// Constants
// =============================================================================

/** localStorage key for saved progress */
const STORAGE_KEY = 'detcord_progress';

/** Expiry time for saved progress in milliseconds (24 hours) */
const PROGRESS_EXPIRY_MS = 24 * 60 * 60 * 1000;

// =============================================================================
// Types
// =============================================================================

/**
 * Filter state that can be saved and restored
 */
export interface SavedFilters {
  /** Text content filter */
  content?: string;
  /** Filter for messages containing links */
  hasLink?: boolean;
  /** Filter for messages containing file attachments */
  hasFile?: boolean;
  /** Whether to include pinned messages */
  includePinned?: boolean;
  /** Regex pattern for content matching */
  pattern?: string;
  /** Minimum message ID (for "after" date filter) */
  minId?: string;
}

/**
 * Saved progress state for resuming deletion sessions
 */
export interface SavedProgress {
  /** Guild (server) ID - optional, for server-wide search */
  guildId?: string;
  /** Channel ID */
  channelId?: string;
  /** ID of the message author (user) */
  authorId: string;
  /** Last maximum message ID processed (for pagination) */
  lastMaxId: string;
  /** Number of messages successfully deleted */
  deletedCount: number;
  /** Total number of messages found matching filters (current) */
  totalFound: number;
  /** Initial total found on first search (for progress calculation) - optional for backward compatibility */
  initialTotalFound?: number;
  /** Timestamp when progress was saved */
  timestamp: number;
  /** Filter state at time of save */
  filters?: SavedFilters;
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Saves deletion progress to localStorage.
 *
 * @param progress - The progress state to save
 * @throws Never throws - handles localStorage errors gracefully
 */
export function saveProgress(progress: SavedProgress): void {
  try {
    const data = JSON.stringify(progress);
    localStorage.setItem(STORAGE_KEY, data);
  } catch {
    // Handle localStorage quota errors or other storage failures gracefully
    // In a userscript context, we can't do much more than silently fail
    // The deletion will continue, just without the ability to resume
  }
}

/**
 * Validates the structure of loaded progress data.
 * Performs runtime type checking to ensure data integrity.
 *
 * @param data - The parsed data to validate
 * @returns True if the data has valid structure
 */
function isValidProgressData(data: unknown): data is SavedProgress {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Validate required string fields
  if (typeof obj.authorId !== 'string' || !isValidSnowflake(obj.authorId)) {
    return false;
  }
  if (typeof obj.lastMaxId !== 'string' || !isValidSnowflake(obj.lastMaxId)) {
    return false;
  }

  // Validate required number fields
  if (typeof obj.timestamp !== 'number' || !Number.isFinite(obj.timestamp)) {
    return false;
  }
  if (typeof obj.deletedCount !== 'number' || !Number.isFinite(obj.deletedCount)) {
    return false;
  }
  if (typeof obj.totalFound !== 'number' || !Number.isFinite(obj.totalFound)) {
    return false;
  }

  // Validate optional string fields (must be valid snowflakes if present)
  if (obj.guildId !== undefined) {
    if (typeof obj.guildId !== 'string') {
      return false;
    }
    // guildId can be a snowflake or special values like "@me"
    if (obj.guildId !== '@me' && !isValidSnowflake(obj.guildId)) {
      return false;
    }
  }
  if (obj.channelId !== undefined) {
    if (typeof obj.channelId !== 'string' || !isValidSnowflake(obj.channelId)) {
      return false;
    }
  }

  // Validate optional initialTotalFound
  if (obj.initialTotalFound !== undefined) {
    if (typeof obj.initialTotalFound !== 'number' || !Number.isFinite(obj.initialTotalFound)) {
      return false;
    }
  }

  // Validate filters object if present
  if (obj.filters !== undefined) {
    if (typeof obj.filters !== 'object' || obj.filters === null) {
      return false;
    }
    const filters = obj.filters as Record<string, unknown>;

    // Validate filter fields
    if (filters.content !== undefined && typeof filters.content !== 'string') {
      return false;
    }
    if (filters.hasLink !== undefined && typeof filters.hasLink !== 'boolean') {
      return false;
    }
    if (filters.hasFile !== undefined && typeof filters.hasFile !== 'boolean') {
      return false;
    }
    if (filters.includePinned !== undefined && typeof filters.includePinned !== 'boolean') {
      return false;
    }
    if (filters.pattern !== undefined && typeof filters.pattern !== 'string') {
      return false;
    }
    if (filters.minId !== undefined) {
      if (typeof filters.minId !== 'string' || !isValidSnowflake(filters.minId)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Loads saved progress from localStorage.
 *
 * @returns The saved progress if it exists, is valid, and is not expired, null otherwise
 */
export function loadProgress(): SavedProgress | null {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      // Invalid JSON - clear corrupted data
      clearProgress();
      return null;
    }

    // Validate the structure of the parsed data
    if (!isValidProgressData(parsed)) {
      // Invalid structure - clear corrupted data
      clearProgress();
      return null;
    }

    // Check if progress has expired (24 hours)
    const now = Date.now();
    if (now - parsed.timestamp > PROGRESS_EXPIRY_MS) {
      // Clear expired progress
      clearProgress();
      return null;
    }

    return parsed;
  } catch {
    // Handle localStorage access errors
    return null;
  }
}

/**
 * Clears saved progress from localStorage.
 */
export function clearProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently fail if localStorage is not available
  }
}

/**
 * Checks if there is an existing saved session that can be resumed.
 *
 * @returns true if a valid, non-expired session exists
 */
export function hasExistingSession(): boolean {
  return loadProgress() !== null;
}

/**
 * Gets the number of deletions until the next auto-save.
 * Progress is saved every 10 deletions.
 *
 * @param deletedCount - Current number of deleted messages
 * @returns Number of deletions until next save (0-9)
 */
export function getDeletionsUntilSave(deletedCount: number): number {
  return 10 - (deletedCount % 10);
}

/**
 * Checks if progress should be saved based on deletion count.
 *
 * @param deletedCount - Current number of deleted messages
 * @returns true if progress should be saved (every 10 deletions)
 */
export function shouldSaveProgress(deletedCount: number): boolean {
  return deletedCount > 0 && deletedCount % 10 === 0;
}
