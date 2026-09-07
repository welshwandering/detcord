/**
 * Page storage access for Detcord.
 *
 * Discord's web client deletes `window.localStorage` from its own window, so a
 * direct reference throws. A same-origin iframe still has an intact `Storage`
 * for the same origin, which is the technique the token extractor has always
 * used. This module centralises that fallback so persistence and token lookup
 * share one tested path.
 */

const PROBE_KEY = '__detcord_storage_probe__';

/** Cached result of the first successful probe; `undefined` until probed. */
let cachedStorage: Storage | null | undefined;

/** The hidden iframe kept attached so its storage stays connected. */
let storageFrame: HTMLIFrameElement | null = null;

/**
 * Checks that a value behaves like a usable `Storage`.
 */
function isUsableStorage(candidate: unknown): candidate is Storage {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }
  const storage = candidate as Storage;
  if (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    return false;
  }
  try {
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads `window.localStorage` defensively; returns null when it is missing or throws.
 */
function probeWindowStorage(): Storage | null {
  try {
    const storage = (window as Window & { localStorage?: unknown }).localStorage;
    return isUsableStorage(storage) ? storage : null;
  } catch {
    return null;
  }
}

/**
 * Creates (once) a hidden same-origin iframe and returns its `localStorage`.
 * The iframe stays attached: storage from a detached frame may be disconnected.
 */
function probeIframeStorage(): Storage | null {
  try {
    if (!storageFrame?.isConnected) {
      const frame = document.createElement('iframe');
      frame.style.display = 'none';
      frame.setAttribute('aria-hidden', 'true');
      frame.setAttribute('title', 'detcord-storage');
      document.body.appendChild(frame);
      storageFrame = frame;
    }
    const storage = storageFrame.contentWindow?.localStorage;
    if (isUsableStorage(storage)) {
      return storage;
    }
    storageFrame.remove();
    storageFrame = null;
    return null;
  } catch {
    storageFrame?.remove();
    storageFrame = null;
    return null;
  }
}

/**
 * Returns a usable `Storage` for the page origin, or null if none is available.
 *
 * Tries `window.localStorage` first, then a hidden same-origin iframe. The
 * result is cached for the lifetime of the page.
 */
export function getPageStorage(): Storage | null {
  if (cachedStorage !== undefined) {
    return cachedStorage;
  }
  cachedStorage = probeWindowStorage() ?? probeIframeStorage();
  return cachedStorage;
}

/**
 * Clears the cached storage reference and removes the helper iframe.
 * Intended for tests and for `unmount()`.
 */
export function resetPageStorage(): void {
  cachedStorage = undefined;
  storageFrame?.remove();
  storageFrame = null;
}
