import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { openHostedDashboard } from './harness.ts';

/**
 * § 5.3's two runtime guarantees, asserted the only way they can be: by what Chromium does.
 * String assertions cannot see either of these — a policy written where the parser does not
 * put head content is silently ignored, and a nonce is only as narrow as the shim's test.
 */

interface Probed {
  readonly policy: boolean;
  readonly inline: boolean;
  readonly handler: boolean;
  readonly violations: string[];
}

/** Serves the cross-origin script the shim must never nonce. */
let server: http.Server;
let origin: string;

test.beforeAll(async () => {
  server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end('window.__exfil = true;');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('dom: the hosted real dashboard runs under a policy Chromium enforces — an unnonced inline script and an inline handler are both refused', async ({
  page
}) => {
  await openHostedDashboard(page);

  await page.evaluate(() => {
    const scope = window as unknown as Record<string, unknown>;
    scope.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      (scope.__violations as string[]).push(event.effectiveDirective);
    });

    const injected = document.createElement('script');
    injected.textContent = 'window.__inline = true;';
    document.body.appendChild(injected);

    const probe = document.createElement('button');
    probe.id = 'csp-probe';
    probe.setAttribute('onclick', 'window.__handler = true;');
    document.body.appendChild(probe);
  });
  await page.locator('#csp-probe').click();

  const probed: Probed = await page.evaluate(() => {
    const scope = window as unknown as Record<string, unknown>;
    return {
      policy: document.querySelector('meta[http-equiv="Content-Security-Policy"]') !== null,
      inline: scope.__inline === true,
      handler: scope.__handler === true,
      violations: scope.__violations as string[]
    };
  });

  // A policy that is merely unviolated proves nothing: assert it is present *and* biting.
  expect(probed.policy, 'the hosted document carries no policy').toBe(true);
  expect(probed.inline, 'an unnonced inline script executed').toBe(false);
  expect(probed.handler, 'an inline event handler executed').toBe(false);
  expect(probed.violations.length, 'Chromium reported no policy violation at all').toBeGreaterThan(
    0
  );
});

test('dom: the shim nonces only the task folder\'s own dashboard-data.js — a cross-origin script of the same name stays unnonced and never runs', async ({
  page
}) => {
  const surface = await openHostedDashboard(page);

  // The legitimate load, cache-buster and all, still reaches the page: the dashboard removes
  // the element once it has run, so the shim's own `ready` post is the record of it.
  await page.waitForFunction(() => (window as unknown as { MAISTER_DATA?: unknown }).MAISTER_DATA);
  const ready = (await surface.posted()).find(
    (message): message is { dataSrc: string; dataLoaded: boolean } =>
      (message as { type?: string }).type === 'ready'
  );
  expect(ready?.dataSrc).toMatch(/^dashboard-data\.js\?t=\d+$/);
  expect(ready?.dataLoaded).toBe(true);

  const remote = await page.evaluate(async (url) => {
    const script = document.createElement('script');
    script.src = url;
    document.body.appendChild(script);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      nonce: script.getAttribute('nonce'),
      exfiltrated: (window as unknown as Record<string, unknown>).__exfil === true
    };
  }, `${origin}/vendor/dashboard-data.js`);

  expect(remote.nonce, 'the shim handed its nonce to a cross-origin script').toBeNull();
  expect(remote.exfiltrated, 'a cross-origin script executed under the webview policy').toBe(
    false
  );
});
