import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };
const releaseAssetUrl =
  'https://github.com/canaryframe/detcord/releases/latest/download/detcord.user.js';

const userscriptBanner = `// ==UserScript==
// @name            Detcord
// @description     Bulk delete your own Discord messages - Fast, secure, privacy-focused
// @version         ${version}
// @author          Welsh Wandering
// @homepageURL     https://github.com/canaryframe/detcord
// @supportURL      https://github.com/canaryframe/detcord/issues
// @updateURL       ${releaseAssetUrl}
// @downloadURL     ${releaseAssetUrl}
// @match           https://*.discord.com/app
// @match           https://*.discord.com/channels/*
// @match           https://*.discord.com/login
// @license         MIT
// @namespace       https://github.com/welshwandering/detcord
// @grant           none
// @run-at          document-end
// ==/UserScript==

`;

function prependBanner(bannerText: string): Plugin {
  return {
    name: 'prepend-banner',
    generateBundle(_options, bundle) {
      for (const fileName in bundle) {
        const chunk = bundle[fileName];
        if (chunk.type === 'chunk') {
          chunk.code = bannerText + chunk.code;
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  build: {
    target: 'es2022',
    outDir: 'dist',
    lib: {
      entry: mode === 'userscript' ? 'src/userscript.ts' : 'src/index.ts',
      name: 'Detcord',
      formats: mode === 'userscript' ? ['iife'] : ['es', 'iife'],
      fileName: (format) => (format === 'iife' ? 'detcord.user.js' : `detcord.${format}.js`),
    },
    minify: mode === 'userscript' ? false : 'oxc',
    sourcemap: mode !== 'userscript',
  },
  // Define build-time constants for security
  // __DEV__ is false in userscript builds to prevent debug API exposure
  define: {
    __DEV__: mode !== 'userscript',
    __VERSION__: JSON.stringify(version),
  },
  plugins: mode === 'userscript' ? [prependBanner(userscriptBanner)] : [],
}));
