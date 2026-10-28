import { defineConfig } from '@playwright/test';
import { E2E_PORT, MOCK_NOW } from './e2e/helpers.ts';

// Browser tests run against the Vite dev server with the mocks, on their own port and a pinned clock. The server
// keeps the chosen scenario globally, so tests run one at a time.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:' + E2E_PORT,
    viewport: { width: 1600, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'e2e', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npx vite --port ' + E2E_PORT + ' --strictPort',
    url: 'http://localhost:' + E2E_PORT,
    env: { PR_BOARD_MOCK_NOW: MOCK_NOW },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
