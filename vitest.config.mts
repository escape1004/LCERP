import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    isolate: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    sequence: {
      concurrent: false,
    },
    passWithNoTests: false,
    server: {
      deps: {
        external: ['better-sqlite3', 'electron'],
      },
    },
  },
  ssr: {
    external: ['better-sqlite3', 'electron'],
  },
});
