import { expect, test as base } from '@playwright/test';

// Third-party hosts whose availability is not part of what we are testing.
const IGNORED_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

// 1x1 PNG served in place of third-party product photos, so the suite never depends on Unsplash / Open Library
// being up or rate-limiting parallel browsers. Set E2E_REAL_IMAGES=1 to hit the real hosts instead.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const IMAGE_HOSTS = /images\.unsplash\.com|covers\.openlibrary\.org/;

/**
 * Every test fails if the browser logged a console error/warning, hit an uncaught exception, had a request fail,
 * or received a 4xx/5xx, unless the test deliberately injects failures and sets `allowErrors`.
 */
export const test = base.extend<{ allowErrors: boolean; problems: void; stubImages: void }>({
  allowErrors: [false, { option: true }],
  // Registered first, so a test that calls page.route() for these hosts (e.g. to abort them) overrides it.
  stubImages: [
    async ({ page }, use) => {
      if (!process.env.E2E_REAL_IMAGES) await page.route(IMAGE_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
      await use();
    },
    { auto: true },
  ],
  problems: [
    async ({ page, allowErrors }, use) => {
      const found: string[] = [];
      const ignored = (url: string) => IGNORED_HOSTS.some((h) => url.includes(h));
      page.on('console', (m) => {
        if (['error', 'warning'].includes(m.type()) && !ignored(m.location().url)) found.push(`console.${m.type()}: ${m.text()}`);
      });
      page.on('pageerror', (e) => found.push(`uncaught: ${e.message}`));
      page.on('requestfailed', (r) => {
        // ERR_ABORTED = the browser cancelled a lazy image when the user navigated away; not a failure.
        if (!ignored(r.url()) && r.failure()?.errorText !== 'net::ERR_ABORTED') found.push(`request failed: ${r.url()} (${r.failure()?.errorText})`);
      });
      page.on('response', (r) => {
        if (r.status() >= 400 && !ignored(r.url())) found.push(`HTTP ${r.status()}: ${r.url()}`);
      });
      await use();
      if (!allowErrors) expect(found, 'console / network problems during the test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
