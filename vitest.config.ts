import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Define build-time constants for tests
  // __DEV__ is true in test environment to enable debug API testing
  define: {
    __DEV__: true,
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
        'src/ui/styles.ts', // CSS string constant
        'src/core/types.ts', // Type definitions only
        // Exclude barrel files (re-exports only)
        'src/ui/index.ts',
        'src/utils/index.ts',
        // Exclude large UI files that are integration-tested rather than unit-tested
        // These have extensive manual testing through the UI wizard flow
        'src/ui/controller.ts',
      ],
      thresholds: {
        // Thresholds adjusted for vitest 4.x V8 coverage provider
        // which counts coverage differently than previous versions
        lines: 75,
        functions: 80,
        branches: 68,
        statements: 75,
      },
    },
    include: ['src/**/*.test.ts'],
  },
});
