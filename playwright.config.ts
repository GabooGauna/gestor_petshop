import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:5173',
  },

  projects: [
    {
      name: 'brave',
      use: {
        ...devices['Desktop Chrome'],
        // Apunta directamente al ejecutable de Brave en Windows
        launchOptions: {
          executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
        },
      },
    },
  ],

  // Inicia automáticamente el servidor de React antes de correr las pruebas
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});