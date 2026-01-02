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

// Declare GM_info for TypeScript (must come before usage)
declare const GM_info: unknown;

// Build-time flag for development mode (injected by Vite)
declare const __DEV__: boolean;

// Re-export core modules
export * from './core';

// Re-export utility modules
export * from './utils';

// Re-export UI modules
export { DetcordUI } from './ui';
export type { DetcordUIOptions } from './ui';

// Version information
export const VERSION = '1.0.0';

// Global UI instance
let ui: import('./ui').DetcordUI | null = null;

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

  // Don't initialize on login page
  if (window.location.pathname === '/login') {
    console.log('[Detcord] On login page, waiting...');
    return;
  }

  console.log(`[Detcord] v${VERSION} loaded`);

  // Import UI dynamically to allow tree-shaking in non-UI contexts
  import('./ui')
    .then(({ DetcordUI }) => {
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
      console.error('[Detcord] Failed to initialize UI:', error);
    });
}

/**
 * Cleanup Detcord resources.
 * Call this when unloading the userscript.
 */
export function destroy(): void {
  if (ui) {
    ui.unmount();
    ui = null;
  }
  // Clean up debug API if it was exposed
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    (window as unknown as Record<string, unknown>).Detcord = undefined;
  }
}

// Auto-initialize when loaded as a userscript
if (typeof window !== 'undefined' && typeof GM_info !== 'undefined') {
  // Running as a userscript
  // Wait for Discord to be ready before initializing
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
}
