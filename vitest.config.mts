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
    passWithNoTests: false,
    server: {
      deps: {
        external: ['better-sqlite3'],
      },
    },
  },
  ssr: {
    external: ['better-sqlite3'],
  },
});
