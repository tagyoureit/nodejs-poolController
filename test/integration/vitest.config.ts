import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: __dirname,
    testTimeout: 120_000,
    hookTimeout: 180_000,
    teardownTimeout: 30_000,
    fileParallelism: false,
    sequence: { concurrent: false },
    reporters: ['verbose'],
    include: ['suites/**/*.test.ts'],
    globals: true,
  },
});
