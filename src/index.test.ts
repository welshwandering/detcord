/**
 * Tests for the main entry point
 *
 * Note: Testing dynamic imports with mocking is complex in Vitest.
 * These tests focus on the synchronous exported functions and their
 * early-return conditions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VERSION, destroy, init } from './index';

describe('index module', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
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
      expect(VERSION).toBe('1.0.0');
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

    it('should log and return early if on login page', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'discord.com', pathname: '/login' },
        writable: true,
        configurable: true,
      });

      init();

      expect(console.log).toHaveBeenCalledWith('[Detcord] On login page, waiting...');
    });

    it('should log version when on Discord channels', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'discord.com', pathname: '/channels/123/456' },
        writable: true,
        configurable: true,
      });

      init();

      expect(console.log).toHaveBeenCalledWith(`[Detcord] v${VERSION} loaded`);
    });

    it('should log version when on Discord app', () => {
      Object.defineProperty(window, 'location', {
        value: { hostname: 'discord.com', pathname: '/app' },
        writable: true,
        configurable: true,
      });

      init();

      expect(console.log).toHaveBeenCalledWith(`[Detcord] v${VERSION} loaded`);
    });
  });

  describe('destroy', () => {
    it('should set window.Detcord to undefined', () => {
      // Simulate an existing Detcord object on window
      (window as unknown as Record<string, unknown>).Detcord = {
        VERSION: '1.0.0',
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
