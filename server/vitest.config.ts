import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The first run downloads a MongoDB binary for mongodb-memory-server: the version production runs
    // (package.json config.mongodbMemoryServer, as in deploy/mongo/compose.yaml).
    hookTimeout: 120_000,
  },
});
