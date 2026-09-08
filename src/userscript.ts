/**
 * Userscript entry point.
 *
 * This file is the entry for the `detcord.user.js` build, and it exports one
 * function on purpose: `bootstrap`, which the entry test calls. The library
 * entry (`./index`) re-exports the core, and a library-mode IIFE built from it
 * would place those re-exports, including the token extractors, on a page
 * global that any script on discord.com could call. Building from here keeps
 * the `Detcord` global down to that single deliberate function.
 */

import { init } from './index';

// Declare GM_info for TypeScript; userscript managers define it.
declare const GM_info: unknown;

/**
 * Starts Detcord once the page has finished loading.
 *
 * Exposed for tests; the userscript build calls it at load.
 */
export function bootstrap(): void {
  if (typeof window === 'undefined' || typeof GM_info === 'undefined') {
    return;
  }
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init, { once: true });
  }
}

bootstrap();
