import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        root: __dirname,
        include: ['**/*.test.ts'],
        environment: 'node',
        fileParallelism: false,
        testTimeout: 5000,
    },
});