import { defineConfig } from '@playwright/test';

// Uses the Edge that ships with Windows by default. Set E2E_BROWSER=chromium to use Playwright's own browser
// (run `npx playwright install chromium` once), or E2E_BROWSER=chrome for installed Google Chrome.
const browser = process.env.E2E_BROWSER ?? 'msedge';
const engine = browser === 'chromium' ? {} : { channel: browser };

// The same buyer journeys run at every size; tests branch where the UI itself differs (sidebar vs. drawer at < 1024px).
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1024, height: 768 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 390, height: 844 },
};

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 3, // each worker drives a full browser; more than this starves a typical laptop
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure', ...engine },
  projects: Object.entries(VIEWPORTS).map(([name, viewport]) => ({ name, use: { viewport } })),
  // Starts the API and the built frontend unless they are already running. The database must be seeded first (`npm run seed`).
  webServer: [
    { command: 'npm run build && npm run start', cwd: 'backend', url: 'http://localhost:3001/api/health', reuseExistingServer: true, timeout: 120_000 },
    // Serves the production build (lighter than the dev server, and it tests what ships). `preview` reuses the dev proxy to :3001.
    { command: 'npm run build && npx vite preview --port 5173 --strictPort', cwd: 'frontend', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 120_000 },
  ],
});
