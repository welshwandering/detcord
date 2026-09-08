/**
 * Detcord - Discord Message Deletion Tool
 *
 * A browser userscript for bulk deletion of a user's own Discord messages.
 *
 * DISCLAIMER:
 * - This project is NOT affiliated with, endorsed by, or connected to Discord Inc.
 * - Discord may change their API at any time, which could break this tool.
 * - This software is provided AS-IS without warranty.
 * - Use at your own risk. The authors are not responsible for any consequences.
 */

// Build-time flag for development mode (injected by Vite)
declare const __DEV__: boolean;

// Package version injected by Vite
declare const __VERSION__: string;

// Re-export core modules
export * from './core';
export type { DetcordUIOptions } from './ui';

// Re-export UI modules
export { DetcordUI } from './ui';
// Re-export utility modules
export * from './utils';

// Version information
export const VERSION = __VERSION__;

// Global UI instance
let ui: import('./ui').DetcordUI | null = null;
let initializationStarted = false;
let initializationGeneration = 0;
let removeNavigationListeners: (() => void) | null = null;

const LOGIN_PATH = '/login';
const NAVIGATION_EVENT = 'detcord:navigate';
const NAVIGATION_POLL_INTERVAL_MS = 2_000;

type HistoryNavigationMethod = History['pushState'];

function createHistoryNavigationMethod(method: HistoryNavigationMethod): HistoryNavigationMethod {
  return function patchedHistoryMethod(this: History, ...args): void {
    method.apply(this, args);
    window.dispatchEvent(new Event(NAVIGATION_EVENT));
  };
}

function stopWaitingForNavigation(): void {
  const cleanup = removeNavigationListeners;
  removeNavigationListeners = null;
  cleanup?.();
}

function waitForPostLoginNavigation(): void {
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  const patchedPushState = createHistoryNavigationMethod(originalPushState);
  const patchedReplaceState = createHistoryNavigationMethod(originalReplaceState);

  const tryInitialize = (): void => {
    if (window.location.pathname === LOGIN_PATH) return;
    stopWaitingForNavigation();
    init();
  };

  window.history.pushState = patchedPushState;
  window.history.replaceState = patchedReplaceState;
  window.addEventListener(NAVIGATION_EVENT, tryInitialize);
  window.addEventListener('popstate', tryInitialize);
  const intervalId = window.setInterval(tryInitialize, NAVIGATION_POLL_INTERVAL_MS);

  removeNavigationListeners = () => {
    window.removeEventListener(NAVIGATION_EVENT, tryInitialize);
    window.removeEventListener('popstate', tryInitialize);
    window.clearInterval(intervalId);

    if (window.history.pushState === patchedPushState) {
      window.history.pushState = originalPushState;
    }
    if (window.history.replaceState === patchedReplaceState) {
      window.history.replaceState = originalReplaceState;
    }
  };
}

function startUi(): void {
  initializationStarted = true;
  const generation = ++initializationGeneration;

  console.log(`[Detcord] v${VERSION} loaded`);

  // Import UI dynamically to allow tree-shaking in non-UI contexts
  void import('./ui')
    .then(({ DetcordUI }) => {
      if (generation !== initializationGeneration || !initializationStarted) return;

      // Create and mount the UI
      ui = new DetcordUI({
        onShow: () => console.log('[Detcord] Window opened'),
        onHide: () => console.log('[Detcord] Window closed'),
        maxFeedEntries: 100,
        progressThrottleMs: 100,
        feedThrottleMs: 50,
      });

      ui.mount();
      console.log('[Detcord] UI mounted');

      // Only expose debug API in development builds
      // This prevents token exposure in production userscripts
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        (window as unknown as Record<string, unknown>).Detcord = {
          VERSION,
          ui,
          show: () => ui?.show(),
          hide: () => ui?.hide(),
          unmount: () => {
            ui?.unmount();
            ui = null;
          },
        };
        console.log('[Detcord] Debug API exposed on window.Detcord');
      }
    })
    .catch((error) => {
      if (generation !== initializationGeneration) return;
      initializationStarted = false;
      console.error('[Detcord] Failed to initialize UI:', error);
    });
}

/**
 * Initialize Detcord when running as a userscript.
 * This is called automatically when the script loads in the browser.
 */
export function init(): void {
  // Check if we're running in a browser environment
  if (typeof window === 'undefined') {
    console.warn('[Detcord] Not running in browser environment');
    return;
  }

  // Check if we're on Discord (strict hostname check to prevent spoofing)
  const hostname = window.location.hostname;
  const isDiscord = hostname === 'discord.com' || hostname.endsWith('.discord.com');
  if (!isDiscord) {
    console.warn('[Detcord] Not on Discord');
    return;
  }

  if (initializationStarted) return;

  if (window.location.pathname === LOGIN_PATH) {
    if (!removeNavigationListeners) {
      console.log('[Detcord] On login page, waiting...');
      waitForPostLoginNavigation();
    }
    return;
  }

  stopWaitingForNavigation();
  startUi();
}

/**
 * Cleanup Detcord resources.
 * Call this when unloading the userscript.
 */
export function destroy(): void {
  stopWaitingForNavigation();
  initializationStarted = false;
  initializationGeneration += 1;

  if (ui) {
    ui.unmount();
    ui = null;
  }
  // Clean up debug API if it was exposed
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    (window as unknown as Record<string, unknown>).Detcord = undefined;
  }
}
