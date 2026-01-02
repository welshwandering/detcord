/**
 * Core type definitions for Detcord
 */

/**
 * Discord message author information
 */
export interface MessageAuthor {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
}

/**
 * Discord message attachment
 */
export interface MessageAttachment {
  id: string;
  filename: string;
  size: number;
  url: string;
  content_type?: string;
}

/**
 * Discord message structure from the API
 */
export interface DiscordMessage {
  id: string;
  channel_id: string;
  author: MessageAuthor;
  content: string;
  timestamp: string;
  attachments: MessageAttachment[];
  pinned: boolean;
  type: number;
  hit?: boolean;
}

/**
 * Parameters for searching messages
 */
export interface SearchParams {
  authorId?: string;
  guildId: string;
  channelId?: string;
  minId?: string;
  maxId?: string;
  content?: string;
  hasLink?: boolean;
  hasFile?: boolean;
  offset?: number;
  includeNsfw?: boolean;
}

/**
 * Response from the Discord search API
 */
export interface SearchResponse {
  messages: DiscordMessage[][];
  total_results: number;
  doing_deep_historical_index?: boolean;
  retry_after?: number;
}

/**
 * Rate limit information from API headers
 */
export interface RateLimitInfo {
  remaining: number | null;
  limit: number | null;
  resetAfter: number | null;
}

/**
 * Result of a delete operation
 */
export type DeleteResult =
  | { success: true }
  | { success: false; error: 'rate_limited'; retryAfter: number }
  | { success: false; error: 'archived_thread' }
  | { success: false; error: 'not_found' }
  | { success: false; error: 'forbidden' }
  | { success: false; error: 'unknown'; status: number; message?: string };

/**
 * Deletion order determines which messages are deleted first
 */
export type DeletionOrder = 'newest' | 'oldest';

/**
 * Configuration options for the deletion engine
 */
export interface DeletionOptions {
  authToken: string;
  authorId: string;
  guildId: string;
  channelId?: string;
  minId?: string;
  maxId?: string;
  content?: string;
  hasLink?: boolean;
  hasFile?: boolean;
  includePinned?: boolean;
  pattern?: string;
  searchDelay?: number;
  deleteDelay?: number;
  maxRetries?: number;
  /** Order to delete messages: 'newest' (default) or 'oldest' first */
  deletionOrder?: DeletionOrder;
}

/**
 * Current state of the deletion engine
 */
export interface DeletionState {
  running: boolean;
  paused: boolean;
  deletedCount: number;
  failedCount: number;
  skippedCount: number;
  totalFound: number;
  currentOffset: number;
}

/**
 * Statistics about the deletion operation
 */
export interface DeletionStats {
  startTime: Date;
  endTime?: Date;
  throttledCount: number;
  throttledTime: number;
  lastPing: number;
  averagePing: number;
  estimatedTimeRemaining: number;
}

/**
 * Callback for deletion progress events
 */
export type ProgressCallback = (
  state: DeletionState,
  stats: DeletionStats,
  message?: DiscordMessage,
) => void;

/**
 * Callback for deletion lifecycle events
 */
export type LifecycleCallback = (state: DeletionState, stats: DeletionStats) => void;

/**
 * Callback for error events
 */
export type ErrorCallback = (error: Error) => void;

/**
 * Event callbacks for the deletion engine
 */
export interface DeletionCallbacks {
  onStart?: LifecycleCallback;
  onProgress?: ProgressCallback;
  onStop?: LifecycleCallback;
  onError?: ErrorCallback;
}

/**
 * Message types that can be deleted by users
 * Type 0 = DEFAULT (normal message)
 * Types 6-21 = Various user-initiated actions (pins, replies, threads, etc.)
 */
export const DELETABLE_MESSAGE_TYPES = [
  0, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
];

/**
 * Check if a message type is deletable
 */
export function isMessageDeletable(type: number): boolean {
  return type === 0 || (type >= 6 && type <= 21);
}
