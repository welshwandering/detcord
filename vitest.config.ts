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
      ],
      thresholds: {
        lines: 80,
        // Function coverage is lower due to UI controller's many private methods
        // that are tested indirectly through the public API
        functions: 73,
        branches: 80,
        statements: 80,
      },
    },
    include: ['src/**/*.test.ts'],
  },
});
