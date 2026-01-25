import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests need longer timeouts
    testTimeout: 60000,
    hookTimeout: 120000,

    // Run tests sequentially to avoid resource contention
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },

    // Include only test files in this directory
    include: ['**/*.test.js'],

    // Exclude node_modules
    exclude: ['**/node_modules/**'],

    // Environment
    environment: 'node',

    // Reporter
    reporters: ['verbose'],
  },
});
