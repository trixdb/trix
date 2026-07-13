import { defineConfig } from 'vitest/config';

// Scope tests to this module only — the worktree contains the whole Trix
// monorepo, whose cross-component suites would otherwise be globbed in.
export default defineConfig({
  test: {
    root: __dirname,
    include: ['src/**/*.test.ts'],
  },
});
