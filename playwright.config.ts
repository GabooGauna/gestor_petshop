import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

const browserExecutable = process.env.PLAYWRIGHT_BROWSER_PATH?.trim();
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const webServerPort = new URL(baseURL).port || '5173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['line'],
    ['html', { open: 'never' }],
  ],

  use: {
    baseURL,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: browserExecutable ? { executablePath: browserExecutable } : undefined,
      },
    },
  ],

  // Inicia automáticamente el servidor de React antes de correr las pruebas
  webServer: process.env.E2E_EXTERNAL_SERVER === 'true' ? undefined : {
    command: `npm run dev -- --host 127.0.0.1 --port ${webServerPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === 'true' || !process.env.CI,
    timeout: 120 * 1000,
  },
});
