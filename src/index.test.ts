/**
 * Tests for the main entry point
 *
 * Note: Testing dynamic imports with mocking is complex in Vitest.
 * These tests focus on the synchronous exported functions and their
 * early-return conditions.
 */

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { destroy, init, VERSION } from './index';

const { version: packageVersion } = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string;
};

describe('index module', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    destroy();
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Reset window.Detcord
    (window as unknown as Record<string, unknown>).Detcord = undefined;
    // Restore location
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  describe('VERSION', () => {
    it('should export version string', () => {
      expect(VERSION).toBe(packageVersion);
      expect(typeof VERSION).toBe('string');
    });
  });

  describe('init', () => {
    it('should warn and return early if not on Discord (example.com)', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'example.com', pathname: '/' },
        writable: true,
        configurable: true,
      });

      init();

      expect(console.warn).toHaveBeenCalledWith('[Detcord] Not on Discord');
    });

    it('should warn and return early if not on Discord (google.com)', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'google.com', pathname: '/' },
        writable: true,
        configurable: true,
      });

      init();

      expect(console.warn).toHaveBeenCalledWith('[Detcord] Not on Discord');
    });

    it('should wait on login and initialize once after pushState navigation', () => {
      const location = { hostname: 'discord.com', pathname: '/login' };
      Object.defineProperty(window, 'location', {
        value: location,
        writable: true,
        configurable: true,
      });
      vi.spyOn(window.history, 'pushState').mockImplementation((_data, _unused, url) => {
        location.pathname = new URL(String(url), 'https://discord.com').pathname;
      });

      init();
      init();
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.history.pushState({}, '', '/channels/123/456');
      window.history.pushState({}, '', '/channels/123/789');

      const waitingLogs = vi
        .mocked(console.log)
        .mock.calls.filter(([message]) => message === '[Detcord] On login page, waiting...');
      expect(waitingLogs).toHaveLength(1);
      const versionLogs = vi
        .mocked(console.log)
        .mock.calls.filter(([message]) => message === `[Detcord] v${VERSION} loaded`);
      expect(versionLogs).toHaveLength(1);
    });

    it('should initialize after replaceState navigation from login', () => {
      const location = { hostname: 'discord.com', pathname: '/login' };
      Object.defineProperty(window, 'location', {
        value: location,
        writable: true,
        configurable: true,
      });
      vi.spyOn(window.history, 'replaceState').mockImplementation((_data, _unused, url) => {
        location.pathname = new URL(String(url), 'https://discord.com').pathname;
      });

      init();
      window.history.replaceState({}, '', '/channels/123/456');

      expect(console.log).toHaveBeenCalledWith(`[Detcord] v${VERSION} loaded`);
    });

    it('should initialize from the polling fallback after the login path changes', () => {
      vi.useFakeTimers();
      const location = { hostname: 'discord.com', pathname: '/login' };
      Object.defineProperty(window, 'location', {
        value: location,
        writable: true,
        configurable: true,
      });

      init();
      location.pathname = '/channels/123/456';
      vi.advanceTimersByTime(2_000);

      expect(console.log).toHaveBeenCalledWith(`[Detcord] v${VERSION} loaded`);
      vi.useRealTimers();
    });

    it('should initialize only once when called repeatedly on Discord channels', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'discord.com', pathname: '/channels/123/456' },
        writable: true,
        configurable: true,
      });

      init();
      init();

      const versionLogs = vi
        .mocked(console.log)
        .mock.calls.filter(([message]) => message === `[Detcord] v${VERSION} loaded`);
      expect(versionLogs).toHaveLength(1);
    });

    it('should mount the UI when on Discord app', async () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'discord.com', pathname: '/app' },
        writable: true,
        configurable: true,
      });

      init();

      expect(console.log).toHaveBeenCalledWith(`[Detcord] v${VERSION} loaded`);
      await vi.waitFor(() => {
        expect(console.log).toHaveBeenCalledWith('[Detcord] UI mounted');
      });
      expect((window as unknown as Record<string, unknown>).Detcord).toMatchObject({
        VERSION: packageVersion,
      });
    });

    it('should not mount a pending UI after destroy', async () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'discord.com', pathname: '/app' },
        writable: true,
        configurable: true,
      });

      init();
      destroy();
      await new Promise((resolve) => window.setTimeout(resolve, 0));

      expect(console.log).not.toHaveBeenCalledWith('[Detcord] UI mounted');
    });
  });

  describe('destroy', () => {
    it('should set window.Detcord to undefined', () => {
      // Simulate an existing Detcord object on window
      (window as unknown as Record<string, unknown>).Detcord = {
        VERSION: packageVersion,
        show: vi.fn(),
        hide: vi.fn(),
      };

      destroy();

      expect((window as unknown as Record<string, unknown>).Detcord).toBeUndefined();
    });

    it('should not throw when called multiple times', () => {
      expect(() => destroy()).not.toThrow();
      expect(() => destroy()).not.toThrow();
      expect(() => destroy()).not.toThrow();
    });

    it('should not throw when UI was never initialized', () => {
      // Ensure no Detcord object exists
      (window as unknown as Record<string, unknown>).Detcord = undefined;

      expect(() => destroy()).not.toThrow();
    });

    it('should handle destroy after setting Detcord', () => {
      (window as unknown as Record<string, unknown>).Detcord = { test: true };
      expect((window as unknown as Record<string, unknown>).Detcord).toBeDefined();

      destroy();

      expect((window as unknown as Record<string, unknown>).Detcord).toBeUndefined();
    });
  });

  describe('exports', () => {
    it('should export init function', () => {
      expect(typeof init).toBe('function');
    });

    it('should export destroy function', () => {
      expect(typeof destroy).toBe('function');
    });

    it('should export VERSION constant', () => {
      expect(typeof VERSION).toBe('string');
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
