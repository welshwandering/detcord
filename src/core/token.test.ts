/**
 * Tests for token and identity extraction.
 *
 * Page storage is mocked so these tests exercise the extraction order and the
 * webpack introspection, not the iframe fallback (covered by storage.test.ts).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPageStorage } from './storage';
import {
  getAuthorId,
  getAuthorIdFromWebpack,
  getChannelIdFromUrl,
  getGuildIdFromUrl,
  getToken,
  getTokenFromLocalStorage,
  getTokenFromWebpack,
} from './token';

vi.mock('./storage', () => ({
  getPageStorage: vi.fn(),
  resetPageStorage: vi.fn(),
}));

const mockedGetPageStorage = vi.mocked(getPageStorage);

/** Installs a fake page storage backed by the supplied entries. */
function useStorage(entries: Record<string, string> | null): void {
  if (entries === null) {
    mockedGetPageStorage.mockReturnValue(null);
    return;
  }
  mockedGetPageStorage.mockReturnValue({
    getItem: (key: string) => entries[key] ?? null,
  } as unknown as Storage);
}

/** Shape of the webpack chunk tuple Detcord pushes. */
type PushedChunk = [string[], Record<string, unknown>, (require: { c: unknown }) => void];

/**
 * Installs a fake `webpackChunkdiscord_app` whose `push` immediately runs the
 * supplied callback against the given module registry.
 */
function useWebpack(modules: Record<string, unknown>): { pushed: PushedChunk[] } {
  const pushed: PushedChunk[] = [];
  const registry = {
    push: (chunk: PushedChunk) => {
      pushed.push(chunk);
      chunk[2]({ c: modules });
      return 0;
    },
  };
  (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = registry;
  return { pushed };
}

/** Builds a webpack module record exposing the given default export. */
function moduleWith(defaultExport: unknown): { exports: { default: unknown } } {
  return { exports: { default: defaultExport } };
}

describe('token extraction', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    useStorage({});
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
    (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = undefined;
  });

  describe('getGuildIdFromUrl', () => {
    it('should extract guild ID from server channel URL', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://discord.com/channels/123456789/987654321' },
        writable: true,
      });
      expect(getGuildIdFromUrl()).toBe('123456789');
    });

    it('should return @me for DM URLs', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://discord.com/channels/@me/987654321' },
        writable: true,
      });
      expect(getGuildIdFromUrl()).toBe('@me');
    });

    it('should return null for non-channel URLs', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://discord.com/login' },
        writable: true,
      });
      expect(getGuildIdFromUrl()).toBeNull();
    });
  });

  describe('getChannelIdFromUrl', () => {
    it('should extract channel ID from URL', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://discord.com/channels/123456789/987654321' },
        writable: true,
      });
      expect(getChannelIdFromUrl()).toBe('987654321');
    });

    it('should extract channel ID from DM URL', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://discord.com/channels/@me/555555555' },
        writable: true,
      });
      expect(getChannelIdFromUrl()).toBe('555555555');
    });

    it('should return null for non-channel URLs', () => {
      Object.defineProperty(window, 'location', {
        value: { href: 'https://discord.com/app' },
        writable: true,
      });
      expect(getChannelIdFromUrl()).toBeNull();
    });
  });

  describe('getTokenFromLocalStorage', () => {
    it('should read the JSON-encoded token from page storage', () => {
      useStorage({ token: JSON.stringify('a-discord-token') });

      expect(getTokenFromLocalStorage()).toBe('a-discord-token');
    });

    it('should return null when the key is absent', () => {
      useStorage({});

      expect(getTokenFromLocalStorage()).toBeNull();
    });

    it('should return null when page storage is unavailable', () => {
      useStorage(null);

      expect(getTokenFromLocalStorage()).toBeNull();
    });

    it('should return null for malformed JSON', () => {
      useStorage({ token: 'invalid-json{' });

      expect(getTokenFromLocalStorage()).toBeNull();
    });

    it('should return null when the stored value is not a string', () => {
      useStorage({ token: JSON.stringify({ nested: true }) });

      expect(getTokenFromLocalStorage()).toBeNull();
    });

    it('should return null for an empty stored string', () => {
      useStorage({ token: JSON.stringify('') });

      expect(getTokenFromLocalStorage()).toBeNull();
    });

    it('should not dispatch a beforeunload event', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      useStorage({ token: JSON.stringify('a-discord-token') });

      getTokenFromLocalStorage();

      expect(dispatchSpy).not.toHaveBeenCalled();
      dispatchSpy.mockRestore();
    });
  });

  describe('getTokenFromWebpack', () => {
    it('should extract the token from the module exposing getToken', () => {
      useWebpack({
        1: moduleWith({ unrelated: () => 'nope' }),
        2: moduleWith({ getToken: () => 'webpack-token' }),
      });

      expect(getTokenFromWebpack()).toBe('webpack-token');
    });

    it('should call getToken bound to its default export', () => {
      const provider = {
        secret: 'bound-token',
        getToken(this: { secret: string }) {
          return this.secret;
        },
      };
      useWebpack({ 1: moduleWith(provider) });

      expect(getTokenFromWebpack()).toBe('bound-token');
    });

    it('should return null when webpack is not present', () => {
      (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = undefined;

      expect(getTokenFromWebpack()).toBeNull();
    });

    it('should return null when the chunk registry has no push', () => {
      (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = {};

      expect(getTokenFromWebpack()).toBeNull();
    });

    it('should return null when no module exposes getToken', () => {
      useWebpack({ 1: moduleWith({ other: () => 'x' }), 2: { exports: {} }, 3: undefined });

      expect(getTokenFromWebpack()).toBeNull();
    });

    it('should ignore modules whose exports are not objects', () => {
      useWebpack({ 1: { exports: 'a string' }, 2: { exports: null } });

      expect(getTokenFromWebpack()).toBeNull();
    });

    it('should ignore an empty-string token', () => {
      useWebpack({ 1: moduleWith({ getToken: () => '' }) });

      expect(getTokenFromWebpack()).toBeNull();
    });

    it('should ignore a non-string token', () => {
      useWebpack({ 1: moduleWith({ getToken: () => 12345 }) });

      expect(getTokenFromWebpack()).toBeNull();
    });

    it('should skip a module whose getToken throws', () => {
      useWebpack({
        1: moduleWith({
          getToken: () => {
            throw new Error('module exploded');
          },
        }),
        2: moduleWith({ getToken: () => 'later-token' }),
      });

      expect(getTokenFromWebpack()).toBe('later-token');
    });

    it('should tolerate a registry without a module cache', () => {
      (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = {
        push: (chunk: PushedChunk) => chunk[2]({ c: undefined }),
      };

      expect(getTokenFromWebpack()).toBeNull();
    });

    it('should return null when push itself throws', () => {
      (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = {
        push: () => {
          throw new Error('webpack rejected the chunk');
        },
      };

      expect(getTokenFromWebpack()).toBeNull();
    });

    it('should use a different chunk id on every call', () => {
      const { pushed } = useWebpack({ 1: moduleWith({ getToken: () => 'tok' }) });

      getTokenFromWebpack();
      getTokenFromWebpack();

      expect(pushed).toHaveLength(2);
      const [first, second] = pushed.map((chunk) => chunk[0][0]);
      expect(first).not.toBe(second);
      expect(first).toMatch(/^detcord-token-extractor-/);
    });
  });

  describe('getAuthorIdFromWebpack', () => {
    it('should read the id from getCurrentUser', () => {
      useWebpack({
        1: moduleWith({ getToken: () => 'tok' }),
        2: moduleWith({ getCurrentUser: () => ({ id: '456789012345678901' }) }),
      });

      expect(getAuthorIdFromWebpack()).toBe('456789012345678901');
    });

    it('should return null when getCurrentUser returns no user', () => {
      useWebpack({ 1: moduleWith({ getCurrentUser: () => null }) });

      expect(getAuthorIdFromWebpack()).toBeNull();
    });

    it('should return null when the user has no string id', () => {
      useWebpack({ 1: moduleWith({ getCurrentUser: () => ({ id: 123 }) }) });

      expect(getAuthorIdFromWebpack()).toBeNull();
    });

    it('should return null when no module exposes getCurrentUser', () => {
      useWebpack({ 1: moduleWith({ getToken: () => 'tok' }) });

      expect(getAuthorIdFromWebpack()).toBeNull();
    });
  });

  describe('getAuthorId', () => {
    it('should prefer the cached user ID in page storage', () => {
      useStorage({ user_id_cache: JSON.stringify('123456789012345678') });
      useWebpack({ 1: moduleWith({ getCurrentUser: () => ({ id: '999' }) }) });

      expect(getAuthorId()).toBe('123456789012345678');
    });

    it('should fall back to webpack when storage has no cached ID', () => {
      useStorage({});
      useWebpack({ 1: moduleWith({ getCurrentUser: () => ({ id: '999999999999999999' }) }) });

      expect(getAuthorId()).toBe('999999999999999999');
    });

    it('should return null when neither source has an ID', () => {
      useStorage(null);

      expect(getAuthorId()).toBeNull();
    });

    it('should return null for a malformed cached ID and no webpack', () => {
      useStorage({ user_id_cache: 'not-json' });

      expect(getAuthorId()).toBeNull();
    });
  });

  describe('getToken', () => {
    it('should try webpack before page storage', () => {
      useStorage({ token: JSON.stringify('storage-token') });
      useWebpack({ 1: moduleWith({ getToken: () => 'webpack-token' }) });

      expect(getToken()).toBe('webpack-token');
      expect(mockedGetPageStorage).not.toHaveBeenCalled();
    });

    it('should fall back to page storage when webpack yields nothing', () => {
      useStorage({ token: JSON.stringify('storage-token') });

      expect(getToken()).toBe('storage-token');
    });

    it('should return null when both strategies fail', () => {
      useStorage(null);

      expect(getToken()).toBeNull();
    });
  });
});

describe('URL helpers without an href', () => {
  it('return null instead of throwing when location has no href', () => {
    const original = window.location;
    Object.defineProperty(window, 'location', {
      value: { hostname: 'discord.com', pathname: '/app' },
      writable: true,
      configurable: true,
    });
    try {
      expect(getGuildIdFromUrl()).toBeNull();
      expect(getChannelIdFromUrl()).toBeNull();
    } finally {
      Object.defineProperty(window, 'location', {
        value: original,
        writable: true,
        configurable: true,
      });
    }
  });
});
