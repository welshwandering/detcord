/**
 * Core modules for Detcord
 */

// Types
export * from './types';

// Token extraction
export {
  getToken,
  getTokenFromLocalStorage,
  getTokenFromWebpack,
  getAuthorId,
  getGuildIdFromUrl,
  getChannelIdFromUrl,
} from './token';

// API client
export { DiscordApiClient } from './discord-api';

// Deletion engine
export { DeletionEngine } from './deletion-engine';
export type {
  DiscordMessage,
  SearchResponse,
  RateLimitInfo,
  DiscordApiClient as IDiscordApiClient,
  DeletionEngineOptions,
  DeletionEngineState,
  DeletionEngineStats,
  DeletionEngineCallbacks,
} from './deletion-engine';
