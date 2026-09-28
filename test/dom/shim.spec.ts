import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { FALLBACK } from '../../src/strings.ts';
import { openHostedDashboard } from './harness.ts';

/**
 * FR4 — the one piece of host-owned chrome the shim adds to a re-hosted dashboard. The real
 * hosted page is the only place the shim runs, so the first two assertions use it; the third
 * needs a document whose `body` never resolves, which no real page can produce.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SHIM = pathToFileURL(path.join(REPO_ROOT, 'dist', 'webview', 'shim.js')).href;
const pages = fs.mkdtempSync(path.join(os.tmpdir(), 'maister-lens-shim-'));
test.afterAll(() => fs.rmSync(pages, { recursive: true, force: true }));

interface StubbedWindow extends Window {
  __posted: unknown[];
}

/** A page carrying the shim and nothing else, with `document.body` permanently unavailable. */
async function openBodylessShim(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const posted: unknown[] = [];
    (window as unknown as StubbedWindow).__posted = posted;
    (window as unknown as { acquireVsCodeApi: unknown }).acquireVsCodeApi = () => ({
      postMessage: (message: unknown) => posted.push(message)
    });
    Object.defineProperty(Document.prototype, 'body', {
      configurable: true,
      get: () => null
    });
  });
  const file = path.join(pages, 'bodyless.html');
  fs.writeFileSync(
    file,
    [
      '<!DOCTYPE html>',
      '<html lang="en"><head>',
      `<script src="${SHIM}"></script>`,
      '</head><body>',
      '<a id="away" href="https://example.invalid/next">away</a>',
      '</body></html>'
    ].join('\n'),
    'utf8'
  );
  await page.goto(pathToFileURL(file).href);
}

test('dom: the shim injects the back link as the first child of the hosted body', async ({
  page
}) => {
  await openHostedDashboard(page);

  const shape = await page.evaluate(() => {
    const first = document.body.firstElementChild;
    const button = first?.querySelector('button');
    return {
      tag: first?.tagName ?? '',
      label: first?.getAttribute('aria-label') ?? '',
      className: first?.className ?? '',
      buttonTag: button?.tagName ?? '',
      buttonType: button?.getAttribute('type') ?? '',
      buttonAriaLabel: button?.getAttribute('aria-label') ?? null,
      text: button?.textContent?.trim() ?? '',
      display: button === null || button === undefined ? '' : getComputedStyle(button).display,
      visibility:
        button === null || button === undefined ? '' : getComputedStyle(button).visibility
    };
  });

  expect(shape.tag).toBe('NAV');
  expect(shape.label).toBe(FALLBACK.breadcrumbLabel);
  expect(shape.className).toContain('maister-lens-back');
  expect(shape.buttonTag).toBe('BUTTON');
  expect(shape.buttonType).toBe('button');
  expect(shape.buttonAriaLabel).toBeNull();
  expect(shape.text).toBe('← Lens Dashboard');
  expect(shape.display).not.toBe('none');
  expect(shape.visibility).toBe('visible');
});

test('dom: clicking the hosted back link posts exactly one openDashboard message', async ({
  page
}) => {
  const surface = await openHostedDashboard(page);

  await page.evaluate(() => {
    document.body.querySelector<HTMLButtonElement>('nav.maister-lens-back button')?.click();
  });

  const posted = (await surface.posted()) as Record<string, unknown>[];
  const navigations = posted.filter((message) => message.type === 'navigate');
  const opens = posted.filter((message) => message.type === 'openDashboard');
  expect(opens).toEqual([{ type: 'openDashboard' }]);
  expect(navigations).toEqual([]);
});

test('dom: with no document.body the injection is skipped and the rest of the shim still runs', async ({
  page
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await openBodylessShim(page);
  await page.evaluate(() => document.getElementById('away')?.click());

  const state = await page.evaluate(() => ({
    injected: document.documentElement.querySelectorAll('.maister-lens-back').length,
    posted: (window as unknown as StubbedWindow).__posted
  }));

  expect(errors).toEqual([]);
  expect(state.injected).toBe(0);
  expect(state.posted).toEqual([{ type: 'navigate', href: 'https://example.invalid/next' }]);
});

/**
 * Every rule here neutralised the link before the priority set was derived from what can
 * actually suppress an element: hide it, collapse its box, clip it, move it out of the
 * viewport or swallow its clicks. A page overlay stacked above the link is deliberately
 * absent — that case is unwinnable from inside the page and is documented instead.
 */
const HOSTILE_CSS = `
nav.maister-lens-back, nav.maister-lens-back button {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  width: 0 !important;
  height: 0 !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: 0 !important;
  max-height: 0 !important;
  font-size: 0 !important;
  line-height: 0 !important;
  overflow: hidden !important;
  transform: scale(0) !important;
  clip-path: inset(100%) !important;
  content-visibility: hidden !important;
  position: absolute !important;
  left: -9999px !important;
  top: -9999px !important;
  float: left !important;
  text-indent: -9999px !important;
}
`;

test('dom: the hosted back link stays visible and clickable under hostile page CSS', async ({
  page
}) => {
  const surface = await openHostedDashboard(page);

  await page.evaluate((css) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
  }, HOSTILE_CSS);

  const link = page.locator('nav.maister-lens-back button');
  await expect(link).toBeVisible();

  const box = await link.boundingBox();
  expect(box, 'the hostile stylesheet collapsed the link out of the layout').not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);

  const hits = await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('nav.maister-lens-back button');
    if (button === null) {
      return false;
    }
    const rect = button.getBoundingClientRect();
    const atPoint = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return button.contains(atPoint) || button === atPoint;
  });
  expect(hits, 'the link is not the topmost element at its own centre').toBe(true);

  await link.click();

  const posted = (await surface.posted()) as Record<string, unknown>[];
  expect(posted.filter((message) => message.type === 'openDashboard')).toEqual([
    { type: 'openDashboard' }
  ]);
});
