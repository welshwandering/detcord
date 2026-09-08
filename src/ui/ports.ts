/**
 * UI-side ports onto the core.
 *
 * The UI depends on narrow interfaces rather than on the concrete engine and
 * API client, so tests can inject fakes and the controller never casts across
 * a module boundary. Every shape here is expressed in the core's own types;
 * nothing is redeclared.
 */

import type {
  DeletionEngineCallbacks,
  DeletionEngineOptions,
  DeletionEngineState,
  DeletionEngineStats,
  DeletionOrder,
  DeletionStopReason,
  DiscordMessage,
  MessageOutcome,
  MessageOutcomeStatus,
  PreviewResult,
  RateLimitChangeInfo,
} from '../core/deletion-engine';
import { DeletionEngine } from '../core/deletion-engine';
import type {
  CurrentUser,
  DeleteOutcome,
  DiscordChannel,
  RateLimitInfo,
  SearchParams,
  SearchResponse,
} from '../core/discord-api';
import { DiscordApiClient } from '../core/discord-api';
import type { SavedFilters, SavedProgress } from '../core/persistence';

export { clearProgress, findResumableSession, targetKeyFor } from '../core/persistence';
export type {
  CurrentUser,
  DeleteOutcome,
  DeletionEngineCallbacks,
  DeletionEngineOptions,
  DeletionEngineState,
  DeletionEngineStats,
  DeletionOrder,
  DeletionStopReason,
  DiscordChannel,
  DiscordMessage,
  MessageOutcome,
  MessageOutcomeStatus,
  PreviewResult,
  RateLimitChangeInfo,
  RateLimitInfo,
  SavedFilters,
  SavedProgress,
  SearchParams,
  SearchResponse,
};

/** Why a run finished, as delivered by the engine's `onStop`. */
export interface StopResult {
  reason: DeletionStopReason;
}

/** The slice of the deletion engine the UI drives. */
export interface EnginePort {
  configure(options: Partial<DeletionEngineOptions>): void;
  setCallbacks(callbacks: DeletionEngineCallbacks): void;
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  getState(): DeletionEngineState;
  getStats(): DeletionEngineStats;
  preview(): Promise<PreviewResult>;
  resumeFromSaved(progress: SavedProgress): void;
}

/**
 * The slice of the Discord API client the UI and the engine depend on.
 *
 * It includes the engine's needs (`deleteMessage`, `getRateLimitInfo`) so one
 * client instance can be handed straight to `new DeletionEngine()`.
 */
export interface ApiClientPort {
  getCurrentUser(): Promise<CurrentUser>;
  getGuildChannels(guildId: string): Promise<DiscordChannel[]>;
  searchMessages(params: SearchParams): Promise<SearchResponse>;
  deleteMessage(channelId: string, messageId: string): Promise<DeleteOutcome>;
  getRateLimitInfo(): RateLimitInfo | null;
}

/** Builds an API client for a token. */
export type ApiClientFactory = (token: string) => ApiClientPort;

/** Builds a deletion engine over an API client. */
export type EngineFactory = (client: ApiClientPort) => EnginePort;

/**
 * Default API client factory.
 *
 * @param token - Discord auth token
 * @returns A real `DiscordApiClient`
 */
export const createDefaultApiClient: ApiClientFactory = (token) => new DiscordApiClient(token);

/**
 * Default deletion engine factory.
 *
 * @param client - API client the engine should drive
 * @returns A real `DeletionEngine`
 */
export const createDefaultEngine: EngineFactory = (client) => new DeletionEngine(client);
