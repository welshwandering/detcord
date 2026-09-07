/**
 * Token extraction utilities for Detcord
 *
 * Discord's client no longer keeps the auth token under the `token` key in
 * storage, so webpack module introspection is the primary route and the
 * storage read is only a fallback for older or forked clients. Nothing here
 * ever throws: every strategy returns null when it cannot produce a value.
 */

import { getPageStorage } from './storage';

/** Storage key Discord historically used for the auth token. */
const TOKEN_STORAGE_KEY = 'token';

/** Storage key Discord uses to remember the last signed-in account. */
const USER_ID_STORAGE_KEY = 'user_id_cache';

/** Name of the webpack chunk registry Discord exposes on `window`. */
const WEBPACK_CHUNK_KEY = 'webpackChunkdiscord_app';

/** A webpack module record as seen through `require.c`. */
interface WebpackModule {
  exports?: unknown;
}

/** The subset of webpack's `require` we touch. */
interface WebpackRequire {
  c?: Record<string, WebpackModule | undefined>;
}

/** The chunk array Discord exposes; pushing a chunk runs our callback. */
type WebpackChunkRegistry = { push(chunk: unknown): unknown };

/**
 * Generates a chunk id that cannot collide with a previous extraction.
 * Webpack keys installed chunks by this value, so a fixed name would make the
 * second call a no-op.
 */
function uniqueChunkId(): string {
  return `detcord-token-extractor-${Math.random().toString(36).slice(2)}`;
}

/**
 * Reads the `default` export of a webpack module, if it has one.
 */
function moduleDefaultExport(module: WebpackModule): Record<string, unknown> | null {
  const exports = module.exports;
  if (!exports || typeof exports !== 'object') {
    return null;
  }
  const defaultExport = (exports as { default?: unknown }).default;
  if (!defaultExport || typeof defaultExport !== 'object') {
    return null;
  }
  return defaultExport as Record<string, unknown>;
}

/**
 * Runs `pick` against every loaded webpack module and returns the first
 * non-null result. No module reference outlives this call.
 *
 * @param pick - Inspector invoked per module; return null to keep looking
 * @returns The first value produced, or null when webpack is absent
 */
function findInWebpackModules<T>(pick: (module: WebpackModule) => T | null): T | null {
  const registry = (window as unknown as Record<string, unknown>)[WEBPACK_CHUNK_KEY] as
    | WebpackChunkRegistry
    | undefined;

  if (!registry || typeof registry.push !== 'function') {
    return null;
  }

  const found: { value: T | null } = { value: null };

  try {
    registry.push([
      [uniqueChunkId()],
      {},
      (webpackRequire: WebpackRequire) => {
        for (const module of Object.values(webpackRequire.c ?? {})) {
          if (!module) {
            continue;
          }
          try {
            const value = pick(module);
            if (value !== null) {
              found.value = value;
              break;
            }
          } catch {
            // A module getter threw; skip it and keep looking.
          }
        }
      },
    ]);
  } catch {
    return null;
  }

  return found.value;
}

/**
 * Attempts to extract the Discord auth token via webpack module introspection.
 *
 * Looks for the module whose default export exposes `getToken()`, which is how
 * Discord's own client reads its token.
 *
 * @returns The token string if found, null otherwise
 */
export function getTokenFromWebpack(): string | null {
  return findInWebpackModules((module) => {
    const defaultExport = moduleDefaultExport(module);
    if (typeof defaultExport?.getToken !== 'function') {
      return null;
    }
    const token: unknown = (defaultExport.getToken as () => unknown).call(defaultExport);
    return typeof token === 'string' && token.length > 0 ? token : null;
  });
}

/**
 * Attempts to extract the current user's ID via webpack module introspection.
 *
 * Looks for the module whose default export exposes `getCurrentUser()`.
 *
 * @returns The user ID string if found, null otherwise
 */
export function getAuthorIdFromWebpack(): string | null {
  return findInWebpackModules((module) => {
    const defaultExport = moduleDefaultExport(module);
    if (typeof defaultExport?.getCurrentUser !== 'function') {
      return null;
    }
    const user: unknown = (defaultExport.getCurrentUser as () => unknown).call(defaultExport);
    const id = (user as { id?: unknown } | null | undefined)?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  });
}

/**
 * Reads a JSON-encoded string from page storage.
 *
 * @param key - Storage key to read
 * @returns The decoded string, or null when absent or malformed
 */
function readJsonString(key: string): string | null {
  try {
    const raw = getPageStorage()?.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'string' && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Attempts to extract the Discord auth token from page storage.
 *
 * Discord removed this key from its own client some years ago, so this is a
 * fallback for forks and older builds rather than the expected path.
 *
 * @returns The token string if found, null otherwise
 */
export function getTokenFromLocalStorage(): string | null {
  return readJsonString(TOKEN_STORAGE_KEY);
}

/**
 * Attempts to determine the current user's ID.
 *
 * Reads the cached user ID from page storage, then falls back to webpack
 * introspection.
 *
 * @returns The user ID string if found, null otherwise
 */
export function getAuthorId(): string | null {
  return readJsonString(USER_ID_STORAGE_KEY) ?? getAuthorIdFromWebpack();
}

/**
 * Extracts the guild (server) ID from the current URL.
 *
 * Discord URLs follow the pattern: /channels/{guildId}/{channelId}
 * For DMs, guildId is "@me"
 *
 * @returns The guild ID string, "@me" for DMs, or null if not found
 */
export function getGuildIdFromUrl(): string | null {
  const match = window.location.href.match(/channels\/([\w@]+)\/(\d+)/);
  return match?.[1] ?? null;
}

/**
 * Extracts the channel ID from the current URL.
 *
 * Discord URLs follow the pattern: /channels/{guildId}/{channelId}
 *
 * @returns The channel ID string or null if not found
 */
export function getChannelIdFromUrl(): string | null {
  const match = window.location.href.match(/channels\/([\w@]+)\/(\d+)/);
  return match?.[2] ?? null;
}

/**
 * Attempts to get the Discord auth token using all available methods.
 *
 * Webpack introspection runs first because it reflects how the live client
 * stores its token; the storage read is the fallback.
 *
 * @returns The token string if found, null otherwise
 */
export function getToken(): string | null {
  return getTokenFromWebpack() ?? getTokenFromLocalStorage();
}
