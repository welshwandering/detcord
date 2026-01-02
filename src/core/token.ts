/**
 * Token extraction utilities for Detcord
 *
 * Provides methods to obtain Discord authentication tokens from the browser environment.
 * These methods work within the Discord web application context.
 */

/**
 * Attempts to extract the Discord auth token from localStorage via an iframe.
 * This bypasses Discord's overridden localStorage by using a fresh iframe context.
 *
 * @returns The token string if found, null otherwise
 */
export function getTokenFromLocalStorage(): string | null {
  try {
    // Trigger beforeunload to ensure localStorage is flushed
    window.dispatchEvent(new Event('beforeunload'));

    // Create iframe to access unmodified localStorage
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) {
      document.body.removeChild(iframe);
      return null;
    }

    const storage = iframeWindow.localStorage;
    document.body.removeChild(iframe);

    const tokenValue = storage.getItem('token');
    if (tokenValue) {
      // Token is stored as JSON string, need to parse
      return JSON.parse(tokenValue) as string;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Attempts to extract the Discord auth token via webpack module introspection.
 * This method looks for the token manager module in Discord's webpack bundles.
 *
 * @returns The token string if found, null otherwise
 */
export function getTokenFromWebpack(): string | null {
  try {
    // Discord uses webpack and exposes chunks on window
    const webpackChunk = (window as unknown as Record<string, unknown>).webpackChunkdiscord_app as
      | Array<unknown>
      | undefined;

    if (!webpackChunk) {
      return null;
    }

    // Collect all webpack modules
    const modules: Array<{ exports?: { default?: { getToken?: () => string } } }> = [];

    webpackChunk.push([
      ['detcord-token-extractor'],
      {},
      (require: { c: Record<string, { exports?: unknown }> }) => {
        for (const moduleId in require.c) {
          const module = require.c[moduleId];
          if (module) {
            modules.push(module as (typeof modules)[0]);
          }
        }
      },
    ]);

    // Find module with getToken method
    for (const module of modules) {
      if (module?.exports?.default?.getToken) {
        const token = module.exports.default.getToken();
        if (typeof token === 'string' && token.length > 0) {
          return token;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Attempts to extract the current user's author ID from localStorage.
 *
 * @returns The user ID string if found, null otherwise
 */
export function getAuthorId(): string | null {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) {
      document.body.removeChild(iframe);
      return null;
    }

    const storage = iframeWindow.localStorage;
    document.body.removeChild(iframe);

    const userIdCache = storage.getItem('user_id_cache');
    if (userIdCache) {
      return JSON.parse(userIdCache) as string;
    }

    return null;
  } catch {
    return null;
  }
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
 * Tries localStorage first, then falls back to webpack introspection.
 *
 * @returns The token string if found, null otherwise
 */
export function getToken(): string | null {
  // Try localStorage first (faster)
  const localStorageToken = getTokenFromLocalStorage();
  if (localStorageToken) {
    return localStorageToken;
  }

  // Fall back to webpack introspection
  return getTokenFromWebpack();
}
