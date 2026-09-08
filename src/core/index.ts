/**
 * Core modules for Detcord
 */

export type {
  DeletionEngineCallbacks,
  DeletionEngineOptions,
  DeletionEngineState,
  DeletionEngineStats,
  DeletionOrder,
  DeletionStopReason,
  DiscordApiClient as IDiscordApiClient,
  DiscordMessage,
  MessageOutcome,
  MessageOutcomeStatus,
  PreviewResult,
  RateLimitChangeInfo,
  RateLimitInfo,
  SearchParams,
  SearchResponse,
} from './deletion-engine';
// Deletion engine
export { DeletionEngine } from './deletion-engine';
// API client
export { DiscordApiClient } from './discord-api';
export type { DiscordApiErrorCode } from './errors';
// Typed API errors
export { DISCORD_ERROR_THREAD_ARCHIVED, DiscordApiError } from './errors';
export type { SavedFilters, SavedProgress } from './persistence';
// Session persistence
export {
  clearProgress,
  findResumableSession,
  getDeletionsUntilSave,
  isValidProgressData,
  loadProgress,
  saveProgress,
  shouldSaveProgress,
  targetKeyFor,
} from './persistence';
// Page storage
export { getPageStorage, resetPageStorage } from './storage';
// Token extraction
export {
  getAuthorId,
  getAuthorIdFromWebpack,
  getChannelIdFromUrl,
  getGuildIdFromUrl,
  getToken,
  getTokenFromLocalStorage,
  getTokenFromWebpack,
} from './token';
