import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.js', 'tests/**/*.test.jsx'],
    exclude: ['node_modules', 'vendor', 'web/dist'],
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 180_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    reporters: process.env.CI ? ['default'] : ['default'],
    setupFiles: ['tests/setup.js'],
  },
  resolve: {
    alias: {
      '@server': path.resolve(process.cwd(), 'server/src'),
      '@web': path.resolve(process.cwd(), 'web/src'),
    },
  },
});
