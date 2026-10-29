import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL,
    extraHTTPHeaders: { accept: 'application/json' },
  },
  projects: [{ name: 'api' }],
});
