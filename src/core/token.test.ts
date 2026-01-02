import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAuthorId,
  getChannelIdFromUrl,
  getGuildIdFromUrl,
  getToken,
  getTokenFromLocalStorage,
  getTokenFromWebpack,
} from './token';

describe('token extraction', () => {
  const originalLocation = window.location;
  const originalDispatchEvent = window.dispatchEvent;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
    window.dispatchEvent = originalDispatchEvent;
    // Clean up webpack mock
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
    it('should extract token from localStorage via iframe', () => {
      const mockToken = 'test-discord-token-123';
      const mockRemove = vi.fn();
      const mockLocalStorage = {
        getItem: vi.fn().mockReturnValue(JSON.stringify(mockToken)),
      };
      const mockIframe = {
        style: { display: '' },
        contentWindow: {
          localStorage: mockLocalStorage,
        },
        remove: mockRemove,
      };

      // Mock document.createElement to return our mock iframe
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'iframe') {
          return mockIframe as unknown as HTMLIFrameElement;
        }
        return originalCreateElement(tagName);
      });

      // Mock document.body.appendChild and removeChild
      const appendChildSpy = vi
        .spyOn(document.body, 'appendChild')
        .mockReturnValue(mockIframe as unknown as HTMLIFrameElement);
      const removeChildSpy = vi
        .spyOn(document.body, 'removeChild')
        .mockReturnValue(mockIframe as unknown as HTMLIFrameElement);

      // Mock dispatchEvent
      window.dispatchEvent = vi.fn();

      const result = getTokenFromLocalStorage();

      expect(result).toBe(mockToken);
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('token');
      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();

      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });

    it('should return null when localStorage is empty', () => {
      const mockLocalStorage = {
        getItem: vi.fn().mockReturnValue(null),
      };
      const mockIframe = {
        style: { display: '' },
        contentWindow: {
          localStorage: mockLocalStorage,
        },
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'iframe') {
          return mockIframe as unknown as HTMLIFrameElement;
        }
        return originalCreateElement(tagName);
      });

      const appendChildSpy = vi
        .spyOn(document.body, 'appendChild')
        .mockReturnValue(mockIframe as unknown as HTMLIFrameElement);
      const removeChildSpy = vi
        .spyOn(document.body, 'removeChild')
        .mockReturnValue(mockIframe as unknown as HTMLIFrameElement);
      window.dispatchEvent = vi.fn();

      const result = getTokenFromLocalStorage();

      expect(result).toBeNull();
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('token');

      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });

    it('should handle JSON parsing errors', () => {
      const mockLocalStorage = {
        getItem: vi.fn().mockReturnValue('invalid-json{'),
      };
      const mockIframe = {
        style: { display: '' },
        contentWindow: {
          localStorage: mockLocalStorage,
        },
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'iframe') {
          return mockIframe as unknown as HTMLIFrameElement;
        }
        return originalCreateElement(tagName);
      });

      const appendChildSpy = vi
        .spyOn(document.body, 'appendChild')
        .mockReturnValue(mockIframe as unknown as HTMLIFrameElement);
      const removeChildSpy = vi
        .spyOn(document.body, 'removeChild')
        .mockReturnValue(mockIframe as unknown as HTMLIFrameElement);
      window.dispatchEvent = vi.fn();

      const result = getTokenFromLocalStorage();

      // Should catch JSON.parse error and return null
      expect(result).toBeNull();

      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });

    it('should return null when iframe contentWindow is null', () => {
      const mockIframe = {
        style: { display: '' },
        contentWindow: null,
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'iframe') {
          return mockIframe as unknown as HTMLIFrameElement;
        }
        return originalCreateElement(tagName);
      });

      const appendChildSpy = vi
        .spyOn(document.body, 'appendChild')
        .mockReturnValue(mockIframe as unknown as HTMLIFrameElement);
      const removeChildSpy = vi
        .spyOn(document.body, 'removeChild')
        .mockReturnValue(mockIframe as unknown as HTMLIFrameElement);
      window.dispatchEvent = vi.fn();

      const result = getTokenFromLocalStorage();

      expect(result).toBeNull();
      // Should still clean up iframe
      expect(removeChildSpy).toHaveBeenCalled();

      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });

    it('should clean up iframe on success', () => {
      const mockToken = 'cleanup-test-token';
      const mockLocalStorage = {
        getItem: vi.fn().mockReturnValue(JSON.stringify(mockToken)),
      };
      const mockIframe = {
        style: { display: '' },
        contentWindow: {
          localStorage: mockLocalStorage,
        },
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'iframe') {
          return mockIframe as unknown as HTMLIFrameElement;
        }
        return originalCreateElement(tagName);
      });

      const removeChildSpy = vi
        .spyOn(document.body, 'removeChild')
        .mockReturnValue(mockIframe as unknown as HTMLIFrameElement);
      vi.spyOn(document.body, 'appendChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );
      window.dispatchEvent = vi.fn();

      getTokenFromLocalStorage();

      expect(removeChildSpy).toHaveBeenCalledWith(mockIframe);

      removeChildSpy.mockRestore();
    });

    it('should clean up iframe on error', () => {
      const mockIframe = {
        style: { display: '' },
        contentWindow: {
          localStorage: {
            getItem: vi.fn().mockImplementation(() => {
              throw new Error('Storage access denied');
            }),
          },
        },
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'iframe') {
          return mockIframe as unknown as HTMLIFrameElement;
        }
        return originalCreateElement(tagName);
      });

      const removeChildSpy = vi
        .spyOn(document.body, 'removeChild')
        .mockReturnValue(mockIframe as unknown as HTMLIFrameElement);
      vi.spyOn(document.body, 'appendChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );
      window.dispatchEvent = vi.fn();

      const result = getTokenFromLocalStorage();

      // Should return null on error
      expect(result).toBeNull();
      // Cleanup happens before error is thrown in getItem, so removeChild is called
      expect(removeChildSpy).toHaveBeenCalled();

      removeChildSpy.mockRestore();
    });

    it('should return null when iframe cannot be created', () => {
      // In jsdom, iframe contentWindow may not have localStorage
      // This tests the error handling path
      const result = getTokenFromLocalStorage();
      // Should not throw, should return null gracefully
      expect(result).toBeNull();
    });
  });

  describe('getTokenFromWebpack', () => {
    it('should extract token from webpack modules', () => {
      const mockToken = 'webpack-extracted-token';
      const mockModules: Record<string, { exports?: { default?: { getToken?: () => string } } }> = {
        module1: {
          exports: {
            default: {
              getToken: () => mockToken,
            },
          },
        },
      };

      // Create a mock webpack chunk that will populate modules when pushed
      const webpackChunk: unknown[] = [];
      const originalPush = webpackChunk.push.bind(webpackChunk);
      webpackChunk.push = (...args: unknown[]) => {
        const chunk = args[0] as [
          string[],
          Record<string, unknown>,
          (require: { c: Record<string, unknown> }) => void,
        ];
        if (chunk?.[2] && typeof chunk[2] === 'function') {
          // Call the require function with our mock modules
          chunk[2]({ c: mockModules });
        }
        return originalPush(...args);
      };

      (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = webpackChunk;

      const result = getTokenFromWebpack();

      expect(result).toBe(mockToken);
    });

    it('should return null when webpack chunk not found', () => {
      // Ensure webpackChunkdiscord_app does not exist
      (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = undefined;

      const result = getTokenFromWebpack();

      expect(result).toBeNull();
    });

    it('should handle missing getToken method', () => {
      const mockModules: Record<
        string,
        { exports?: { default?: { someOtherMethod?: () => string } } }
      > = {
        module1: {
          exports: {
            default: {
              someOtherMethod: () => 'not-a-token',
            },
          },
        },
      };

      const webpackChunk: unknown[] = [];
      const originalPush = webpackChunk.push.bind(webpackChunk);
      webpackChunk.push = (...args: unknown[]) => {
        const chunk = args[0] as [
          string[],
          Record<string, unknown>,
          (require: { c: Record<string, unknown> }) => void,
        ];
        if (chunk?.[2] && typeof chunk[2] === 'function') {
          chunk[2]({ c: mockModules });
        }
        return originalPush(...args);
      };

      (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = webpackChunk;

      const result = getTokenFromWebpack();

      expect(result).toBeNull();
    });

    it('should return null when getToken returns empty string', () => {
      const mockModules: Record<string, { exports?: { default?: { getToken?: () => string } } }> = {
        module1: {
          exports: {
            default: {
              getToken: () => '',
            },
          },
        },
      };

      const webpackChunk: unknown[] = [];
      const originalPush = webpackChunk.push.bind(webpackChunk);
      webpackChunk.push = (...args: unknown[]) => {
        const chunk = args[0] as [
          string[],
          Record<string, unknown>,
          (require: { c: Record<string, unknown> }) => void,
        ];
        if (chunk?.[2] && typeof chunk[2] === 'function') {
          chunk[2]({ c: mockModules });
        }
        return originalPush(...args);
      };

      (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = webpackChunk;

      const result = getTokenFromWebpack();

      expect(result).toBeNull();
    });

    it('should return null when getToken returns non-string', () => {
      const mockModules: Record<string, { exports?: { default?: { getToken?: () => unknown } } }> =
        {
          module1: {
            exports: {
              default: {
                getToken: () => 12345,
              },
            },
          },
        };

      const webpackChunk: unknown[] = [];
      const originalPush = webpackChunk.push.bind(webpackChunk);
      webpackChunk.push = (...args: unknown[]) => {
        const chunk = args[0] as [
          string[],
          Record<string, unknown>,
          (require: { c: Record<string, unknown> }) => void,
        ];
        if (chunk?.[2] && typeof chunk[2] === 'function') {
          chunk[2]({ c: mockModules });
        }
        return originalPush(...args);
      };

      (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = webpackChunk;

      const result = getTokenFromWebpack();

      expect(result).toBeNull();
    });

    it('should handle null modules', () => {
      const mockModules: Record<string, null> = {
        module1: null,
      };

      const webpackChunk: unknown[] = [];
      const originalPush = webpackChunk.push.bind(webpackChunk);
      webpackChunk.push = (...args: unknown[]) => {
        const chunk = args[0] as [
          string[],
          Record<string, unknown>,
          (require: { c: Record<string, unknown> }) => void,
        ];
        if (chunk?.[2] && typeof chunk[2] === 'function') {
          chunk[2]({ c: mockModules });
        }
        return originalPush(...args);
      };

      (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = webpackChunk;

      const result = getTokenFromWebpack();

      expect(result).toBeNull();
    });

    it('should handle webpack errors gracefully', () => {
      // Set up a webpack chunk that throws an error
      const webpackChunk = {
        push: () => {
          throw new Error('Webpack error');
        },
      };

      (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = webpackChunk;

      const result = getTokenFromWebpack();

      expect(result).toBeNull();
    });

    it('should find token among multiple modules', () => {
      const mockToken = 'found-in-third-module';
      const mockModules: Record<string, { exports?: { default?: { getToken?: () => string } } }> = {
        module1: { exports: {} },
        module2: { exports: { default: {} } },
        module3: {
          exports: {
            default: {
              getToken: () => mockToken,
            },
          },
        },
      };

      const webpackChunk: unknown[] = [];
      const originalPush = webpackChunk.push.bind(webpackChunk);
      webpackChunk.push = (...args: unknown[]) => {
        const chunk = args[0] as [
          string[],
          Record<string, unknown>,
          (require: { c: Record<string, unknown> }) => void,
        ];
        if (chunk?.[2] && typeof chunk[2] === 'function') {
          chunk[2]({ c: mockModules });
        }
        return originalPush(...args);
      };

      (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = webpackChunk;

      const result = getTokenFromWebpack();

      expect(result).toBe(mockToken);
    });
  });

  describe('getAuthorId', () => {
    it('should extract user ID from localStorage', () => {
      const mockUserId = '123456789012345678';
      const mockLocalStorage = {
        getItem: vi.fn().mockReturnValue(JSON.stringify(mockUserId)),
      };
      const mockIframe = {
        style: { display: '' },
        contentWindow: {
          localStorage: mockLocalStorage,
        },
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'iframe') {
          return mockIframe as unknown as HTMLIFrameElement;
        }
        return originalCreateElement(tagName);
      });

      vi.spyOn(document.body, 'appendChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );
      vi.spyOn(document.body, 'removeChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );

      const result = getAuthorId();

      expect(result).toBe(mockUserId);
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('user_id_cache');
    });

    it('should return null when user_id_cache is missing', () => {
      const mockLocalStorage = {
        getItem: vi.fn().mockReturnValue(null),
      };
      const mockIframe = {
        style: { display: '' },
        contentWindow: {
          localStorage: mockLocalStorage,
        },
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'iframe') {
          return mockIframe as unknown as HTMLIFrameElement;
        }
        return originalCreateElement(tagName);
      });

      vi.spyOn(document.body, 'appendChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );
      vi.spyOn(document.body, 'removeChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );

      const result = getAuthorId();

      expect(result).toBeNull();
    });

    it('should return null when iframe contentWindow is null', () => {
      const mockIframe = {
        style: { display: '' },
        contentWindow: null,
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'iframe') {
          return mockIframe as unknown as HTMLIFrameElement;
        }
        return originalCreateElement(tagName);
      });

      vi.spyOn(document.body, 'appendChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );
      vi.spyOn(document.body, 'removeChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );

      const result = getAuthorId();

      expect(result).toBeNull();
    });

    it('should handle JSON parsing errors', () => {
      const mockLocalStorage = {
        getItem: vi.fn().mockReturnValue('invalid-json'),
      };
      const mockIframe = {
        style: { display: '' },
        contentWindow: {
          localStorage: mockLocalStorage,
        },
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'iframe') {
          return mockIframe as unknown as HTMLIFrameElement;
        }
        return originalCreateElement(tagName);
      });

      vi.spyOn(document.body, 'appendChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );
      vi.spyOn(document.body, 'removeChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );

      const result = getAuthorId();

      expect(result).toBeNull();
    });

    it('should return null when localStorage is not accessible', () => {
      const result = getAuthorId();
      expect(result).toBeNull();
    });
  });

  describe('getToken', () => {
    it('should try localStorage first', () => {
      const localStorageToken = 'localStorage-token-first';
      const mockLocalStorage = {
        getItem: vi.fn().mockReturnValue(JSON.stringify(localStorageToken)),
      };
      const mockIframe = {
        style: { display: '' },
        contentWindow: {
          localStorage: mockLocalStorage,
        },
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'iframe') {
          return mockIframe as unknown as HTMLIFrameElement;
        }
        return originalCreateElement(tagName);
      });

      vi.spyOn(document.body, 'appendChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );
      vi.spyOn(document.body, 'removeChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );
      window.dispatchEvent = vi.fn();

      const result = getToken();

      expect(result).toBe(localStorageToken);
      // Should not need to check webpack if localStorage succeeds
    });

    it('should fall back to webpack when localStorage fails', () => {
      const webpackToken = 'webpack-fallback-token';

      // Make localStorage fail
      const mockIframe = {
        style: { display: '' },
        contentWindow: {
          localStorage: {
            getItem: vi.fn().mockReturnValue(null),
          },
        },
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'iframe') {
          return mockIframe as unknown as HTMLIFrameElement;
        }
        return originalCreateElement(tagName);
      });

      vi.spyOn(document.body, 'appendChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );
      vi.spyOn(document.body, 'removeChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );
      window.dispatchEvent = vi.fn();

      // Set up webpack to succeed
      const mockModules: Record<string, { exports?: { default?: { getToken?: () => string } } }> = {
        module1: {
          exports: {
            default: {
              getToken: () => webpackToken,
            },
          },
        },
      };

      const webpackChunk: unknown[] = [];
      const originalPush = webpackChunk.push.bind(webpackChunk);
      webpackChunk.push = (...args: unknown[]) => {
        const chunk = args[0] as [
          string[],
          Record<string, unknown>,
          (require: { c: Record<string, unknown> }) => void,
        ];
        if (chunk?.[2] && typeof chunk[2] === 'function') {
          chunk[2]({ c: mockModules });
        }
        return originalPush(...args);
      };

      (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = webpackChunk;

      const result = getToken();

      expect(result).toBe(webpackToken);
    });

    it('should return null when both methods fail', () => {
      // Make localStorage fail
      const mockIframe = {
        style: { display: '' },
        contentWindow: {
          localStorage: {
            getItem: vi.fn().mockReturnValue(null),
          },
        },
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'iframe') {
          return mockIframe as unknown as HTMLIFrameElement;
        }
        return originalCreateElement(tagName);
      });

      vi.spyOn(document.body, 'appendChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );
      vi.spyOn(document.body, 'removeChild').mockReturnValue(
        mockIframe as unknown as HTMLIFrameElement,
      );
      window.dispatchEvent = vi.fn();

      // Make webpack fail (no webpackChunkdiscord_app)
      (window as unknown as Record<string, unknown>).webpackChunkdiscord_app = undefined;

      const result = getToken();

      expect(result).toBeNull();
    });

    it('should return null when no token methods succeed', () => {
      const result = getToken();
      expect(result).toBeNull();
    });
  });
});
