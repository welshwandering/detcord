import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  // Define build-time constants for tests
  // __DEV__ is true in test environment to enable debug API testing
  define: {
    __DEV__: true,
    __VERSION__: JSON.stringify(version),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '.archive/',
        '**/*.d.ts',
        'vitest.config.ts',
        'commitlint.config.js',
        'vite.config.ts',
        // Exclude files that are purely static content (no logic to test)
        'src/ui/window-styles.ts', // CSS string constant
        // Exclude barrel files (re-exports only)
        'src/ui/index.ts',
        'src/utils/index.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85,
      },
    },
    include: ['src/**/*.test.ts'],
  },
});
