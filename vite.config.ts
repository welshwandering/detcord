import { defineConfig, type Plugin } from 'vite';

const userscriptBanner = `// ==UserScript==
// @name            Detcord
// @description     Bulk delete your own Discord messages - Fast, secure, privacy-focused
// @version         1.0.0
// @author          Welsh Wandering
// @homepageURL     https://github.com/welshwandering/detcord
// @supportURL      https://github.com/welshwandering/detcord/discussions
// @match           https://*.discord.com/app
// @match           https://*.discord.com/channels/*
// @match           https://*.discord.com/login
// @license         MIT
// @namespace       https://github.com/welshwandering/detcord
// @icon            https://welshwandering.github.io/detcord/images/icon128.png
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
      entry: 'src/index.ts',
      name: 'Detcord',
      formats: mode === 'userscript' ? ['iife'] : ['es', 'iife'],
      fileName: (format) => (format === 'iife' ? 'detcord.user.js' : `detcord.${format}.js`),
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: mode === 'userscript' ? false : 'esbuild',
    sourcemap: mode !== 'userscript',
  },
  // Define build-time constants for security
  // __DEV__ is false in userscript builds to prevent debug API exposure
  define: {
    __DEV__: mode !== 'userscript',
  },
  plugins: mode === 'userscript' ? [prependBanner(userscriptBanner)] : [],
}));
