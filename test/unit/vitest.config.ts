import { defineConfig } from 'vitest/config';

// Sun-schedule tests use New York coordinates and assert local-time dates, so pin the
// process timezone to match (CI runners default to UTC).
process.env.TZ = 'America/New_York';

export default defineConfig({
    test: {
        root: __dirname,
        include: ['**/*.test.ts'],
        environment: 'node',
        fileParallelism: false,
        testTimeout: 5000,
    },
});