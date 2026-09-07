import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPageStorage, resetPageStorage } from './storage';

/** Minimal in-memory Storage for deterministic tests. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  } as Storage;
}

const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

function restoreWindowStorage(): void {
  if (originalDescriptor) {
    Object.defineProperty(window, 'localStorage', originalDescriptor);
  } else {
    // Remove any own property a test installed so the prototype value shows through again.
    delete (window as unknown as Record<string, unknown>).localStorage;
  }
}

describe('getPageStorage', () => {
  let createElementSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    resetPageStorage();
  });

  afterEach(() => {
    createElementSpy?.mockRestore();
    createElementSpy = null;
    restoreWindowStorage();
    resetPageStorage();
    document.body.innerHTML = '';
  });

  it('returns window.localStorage when it is usable', () => {
    // This test environment (Node's experimental Web Storage under jsdom) has no
    // baseline localStorage, so install a usable one explicitly.
    const windowStorage = fakeStorage();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: windowStorage });
    const storage = getPageStorage();
    expect(storage).toBe(windowStorage);
    // No iframe is created when the window's own storage works.
    expect(document.body.querySelector('iframe')).toBeNull();
  });

  it('falls back to a hidden iframe when window.localStorage is deleted, as Discord does', () => {
    // Simulate Discord: the accessor is gone and reads return undefined.
    Object.defineProperty(window, 'localStorage', { configurable: true, value: undefined });
    const frameStorage = fakeStorage();
    const realCreate = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'iframe') {
        Object.defineProperty(el, 'contentWindow', {
          configurable: true,
          get: () => ({ localStorage: frameStorage }),
        });
      }
      return el;
    });

    const storage = getPageStorage();
    expect(storage).toBe(frameStorage);
    const frame = document.body.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame?.style.display).toBe('none');
    // Stays attached so the storage remains connected.
    expect(frame?.isConnected).toBe(true);
  });

  it('falls back to the iframe when window.localStorage throws on access', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('SecurityError');
      },
    });
    const frameStorage = fakeStorage();
    const realCreate = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'iframe') {
        Object.defineProperty(el, 'contentWindow', {
          configurable: true,
          get: () => ({ localStorage: frameStorage }),
        });
      }
      return el;
    });
    expect(getPageStorage()).toBe(frameStorage);
  });

  it('returns null when neither the window nor an iframe offers storage', () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: undefined });
    const realCreate = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'iframe') {
        Object.defineProperty(el, 'contentWindow', { configurable: true, get: () => null });
      }
      return el;
    });
    expect(getPageStorage()).toBeNull();
    // The useless iframe is removed again.
    expect(document.body.querySelector('iframe')).toBeNull();
  });

  it('caches the probe result until reset', () => {
    const first = getPageStorage();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: undefined });
    expect(getPageStorage()).toBe(first);
    resetPageStorage();
    // After reset, the deleted window storage forces a new probe.
    const realCreate = document.createElement.bind(document);
    const frameStorage = fakeStorage();
    createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'iframe') {
        Object.defineProperty(el, 'contentWindow', {
          configurable: true,
          get: () => ({ localStorage: frameStorage }),
        });
      }
      return el;
    });
    expect(getPageStorage()).toBe(frameStorage);
  });
});
