import { defineConfig } from '@playwright/test';

/**
 * A10's third harness: Playwright loads each bundle's generated HTML in a plain browser page
 * and asserts its structure. One browser, headless, no screenshots — comparison against the
 * mockups is the manual checklist's job, not this harness's.
 */
export default defineConfig({
  testDir: 'test/dom',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  reporter: [['list']],
  use: { browserName: 'chromium' }
});
