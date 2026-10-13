import { expect, test } from '@playwright/test';
import { DASHBOARD, FALLBACK, FOLLOW_UPS, OVERVIEW, PANEL, READER, format } from '../../src/strings.ts';
import {
  dashboardPayload,
  fallbackPayload,
  focusables,
  followUpsPayload,
  headings,
  openHostedDashboard,
  openSurface,
  overviewPayload,
  projectPayload,
  readerDocPayload,
  readerPayload,
  tabOrder,
  texts
} from './harness.ts';

/**
 * The DOM halves A16 assigns to this harness: AC4, AC5, AC6, AC8, AC14, AC17 and AC18.
 * Every assertion is structural — selectors, section and field order, copy taken from
 * `src/strings.ts`, accessible names and the payload an activation posts. Nothing here
 * compares pixels.
 */

const SURFACES = [
  { bundle: 'overview', payload: overviewPayload() },
  { bundle: 'fallbackTask', payload: fallbackPayload() },
  { bundle: 'reader', payload: readerPayload() },
  { bundle: 'reader', payload: readerDocPayload() },
  { bundle: 'dashboardMode', payload: dashboardPayload() },
  { bundle: 'followUpsMode', payload: followUpsPayload() },
  { bundle: 'projectMode', payload: projectPayload() }
] as const;

test('dom: the shim turns a click on the real dashboard\'s a[target="_blank"] into a navigate post carrying that href', async ({
  page
}) => {
  const surface = await openHostedDashboard(page);

  const link = page.locator('a[target="_blank"]').first();
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href).not.toBeNull();

  await link.click();

  expect(await surface.posted()).toContainEqual({ type: 'navigate', href });
});

test('dom: reader HTML contains the summary card whenever summary is non-null, and omits it when null', async ({
  page
}) => {
  const surface = await openSurface(page, 'reader', readerPayload());

  const card = page.locator('aside.rd-summary');
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute('aria-label', READER.summaryLabel);

  // Field order inside the card, as § 6.3 and the reader mockup draw it.
  expect(await texts(page, 'aside.rd-summary > h2')).toEqual([
    READER.tldrLabel,
    READER.decisionsLabel,
    READER.risksLabel
  ]);
  await expect(card.locator('p').first()).toHaveText('Rotate the refresh token on every use.');
  await expect(card.locator('p.rd-checklist')).toHaveText(
    format(READER.checklist, { done: 2, total: 5, skipped: 1 })
  );
  // AC18's reader half: a resolved risk is struck through and keeps a visible label.
  await expect(card.locator('li s')).toHaveText('Clock skew on token expiry');
  await expect(card.locator('li .chip')).toHaveText(READER.riskResolved);

  await surface.post(readerPayload({ summary: null, checklist: null }));
  await expect(page.locator('aside.rd-summary')).toHaveCount(0);
  await expect(page.locator('main#doc')).toHaveCount(1);
});

test('dom: generated fallback HTML renders all four § 5.4 sections in order', async ({ page }) => {
  await openSurface(page, 'fallbackTask', fallbackPayload());

  await expect(page.locator('p.banner')).toContainText(PANEL.bannerNoDashboard);
  await expect(page.locator('h1.fb-title')).toHaveText('Auth token rotation');

  // The four AC6 sections, in § 5.4 order, inside the full rendered heading order.
  expect(await headings(page, 'h2')).toEqual([
    FALLBACK.phasesLabel,
    FALLBACK.heroesLabel,
    FALLBACK.decisionsLabel,
    FALLBACK.risksLabel,
    FALLBACK.artifactsLabel,
    FALLBACK.rawStateLabel
  ]);
  const ordered = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll('p.banner, ol.fb-phases, div.fb-cards, ul.fb-list, details')
    ).map(
      (node) => node.className || node.tagName.toLowerCase()
    )
  );
  expect(ordered.slice(0, 5)).toEqual([
    'banner',
    'plain fb-phases',
    'fb-cards',
    'fb-list',
    'fb-list'
  ]);

  // Field order of the header meta line, exactly as `strings.ts` spells it. The status field
  // draws the glyph beside the word, the way the mockup and every other surface draw it.
  expect(await texts(page, 'p.fb-meta > span')).toEqual([
    'Development',
    format(FALLBACK.status, { status: '◯ In progress' }),
    format(FALLBACK.author, { author: 'Marek Nowak' }),
    format(FALLBACK.verdict, { verdict: FALLBACK.verdictNone }),
    format(FALLBACK.dates, { created: '1 Sep 2026', updated: '22 Sep 2026' })
  ]);

  // The glyph is decoration; the word beside it carries the meaning, and carries it once —
  // a screen reader must not hear the status stuttered.
  const status = page.locator('p.fb-meta > span').nth(1);
  await expect(status.locator('span.glyph')).toHaveText('◯');
  await expect(status.locator('span.glyph')).toHaveAttribute('aria-hidden', 'true');
  expect(
    await status.evaluate((node) => (node.textContent ?? '').split('In progress').length - 1)
  ).toBe(1);
  await expect(status.locator('span.sr-only')).toHaveCount(0);
  expect(await texts(page, 'ol.fb-phases li .fb-phase-name')).toEqual([
    format(FALLBACK.phaseLine, { position: 1, name: 'Specification' }),
    format(FALLBACK.phaseLine, { position: 2, name: 'Implementation' })
  ]);
});

test('dom: Overview keeps its document box inside the viewport at both sidebar widths', async ({
  page
}) => {
  for (const width of [250, 400]) {
    await page.setViewportSize({ width, height: 900 });
    await openSurface(page, 'overview', overviewPayload());

    const box = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    expect(box.scrollWidth, `overview at ${width}px`).toBeLessThanOrEqual(box.clientWidth);
  }
});

test('dom: a Dashboard bar activation posts setFilter with the right patch; charts keep all-task counts while table rows are filtered; each Table link\'s numbers equal its chart\'s', async ({
  page
}) => {
  const payload = dashboardPayload();
  const surface = await openSurface(page, 'dashboardMode', payload);

  const statusChart = page.locator('section.chart').first();
  await expect(statusChart.locator('h3')).toHaveText(DASHBOARD.chartStatus);

  // Charts count every task; only the table follows the shared TaskQuery.
  const barValues = await texts(page, 'section.chart:first-of-type .bar-value');
  expect(barValues).toEqual(payload.charts[0].bars.map((bar) => String(bar.count)));
  const chartTotal = payload.charts[0].bars.reduce((sum, bar) => sum + bar.count, 0);
  expect(chartTotal).toBe(payload.total);
  await expect(page.locator('table.task-table tbody tr')).toHaveCount(payload.rows.length);
  expect(payload.rows.length).toBeLessThan(payload.total);

  // The Table link shows the same numbers the chart drew.
  await statusChart
    .getByRole('button', { name: format(DASHBOARD.tableLinkLabel, { chart: DASHBOARD.chartStatus }) })
    .click();
  const rows = await statusChart.locator('table.chart-table tbody tr').evaluateAll((items) =>
    items.map((item) => [
      item.querySelector('th')?.textContent ?? '',
      item.querySelector('td')?.textContent ?? ''
    ])
  );
  expect(rows).toEqual(payload.charts[0].bars.map((bar) => [bar.label, String(bar.count)]));
  await expect(
    statusChart.getByRole('button', {
      name: format(DASHBOARD.chartLinkLabel, { chart: DASHBOARD.chartStatus })
    })
  ).toHaveCount(1);

  // A bar activation posts the patch for its own facet only.
  await statusChart
    .getByRole('button', { name: format(DASHBOARD.chartLinkLabel, { chart: DASHBOARD.chartStatus }) })
    .click();
  await page
    .getByRole('button', {
      name: format(DASHBOARD.barLabel, { label: 'In progress', count: 4 })
    })
    .click();
  expect(await surface.posted()).toContainEqual({
    type: 'setFilter',
    patch: { statuses: ['completed', 'in_progress'] }
  });
});

test('dom: every interactive element in all six generated surfaces is a <button>/<a> with an accessible name in a tab-reachable order; each surface renders exactly one next-action control per row, distinct from the title control', async ({
  page
}) => {
  for (const surface of SURFACES) {
    await openSurface(page, surface.bundle, surface.payload);

    const controls = await focusables(page);
    expect(controls.length, `${surface.bundle} renders interactive elements`).toBeGreaterThan(0);
    const wrongTag = controls.filter((control) => !['button', 'a', 'input'].includes(control.tag));
    expect(wrongTag, `${surface.bundle} uses only button/a/input controls`).toEqual([]);
    const unnamed = controls.filter((control) => control.name === '');
    expect(unnamed, `${surface.bundle} names every control`).toEqual([]);
    const jumped = controls.filter((control) => Number(control.tabindex ?? '0') > 0);
    expect(jumped, `${surface.bundle} adds no positive tabindex`).toEqual([]);

    // Keyboard order follows document order — nothing is reachable only by pointer.
    const steps = Math.min(6, controls.length);
    expect(await tabOrder(page, steps), `${surface.bundle} tab order`).toEqual(
      [...Array(steps).keys()]
    );
  }

  // AC17 — one next-action control per row, never the control that opens the task.
  await openSurface(page, 'overview', overviewPayload());
  await expect(page.locator('li.trow')).toHaveCount(2);
  await expect(page.locator('li.trow:first-child .row-action')).toHaveCount(1);
  await expect(page.locator('li.trow:first-child .trow-title')).toHaveCount(1);
  await expect(page.locator('li.trow:last-child .row-action')).toHaveCount(0);

  await openSurface(page, 'dashboardMode', dashboardPayload());
  await expect(page.locator('table.task-table tbody tr:first-child .action-small')).toHaveCount(1);
  await expect(page.locator('table.task-table tbody tr:first-child .link')).toHaveCount(1);
  await expect(
    page.locator('table.task-table tbody tr:first-child .action-small')
  ).toHaveAttribute(
    'aria-label',
    format(DASHBOARD.nextActionLabel, { action: 'Resume', title: 'Auth token rotation' })
  );

  await openSurface(page, 'fallbackTask', fallbackPayload());
  await expect(page.locator('.fb-head .action')).toHaveCount(1);
});

test('dom: the Overview surface labels its document box with OVERVIEW.title', async ({ page }) => {
  await openSurface(page, 'overview', overviewPayload());

  await expect(page.locator('main#root')).toHaveAttribute('aria-label', OVERVIEW.title);
});

test('dom: the fallbackTask back link is the first focusable control, and the surface inventory is the six bundles plus a doc-mode reader', async ({
  page
}) => {
  expect(SURFACES.map((surface) => surface.bundle)).toEqual([
    'overview',
    'fallbackTask',
    'reader',
    'reader',
    'dashboardMode',
    'followUpsMode',
    'projectMode'
  ]);

  await openSurface(page, 'fallbackTask', fallbackPayload());

  const controls = await focusables(page);
  expect(controls[0].tag).toBe('button');
  expect(controls[0].name).toBe(FALLBACK.breadcrumb);
  expect(await tabOrder(page, 1)).toEqual([0]);
});

test('dom: a Follow-ups group expander hides and reveals its list', async ({ page }) => {
  await openSurface(page, 'followUpsMode', followUpsPayload());
  const list = page.locator('section.follow-up-group ul.follow-ups');
  const expander = page.locator('section.follow-up-group .expander');
  await expect(list).toBeVisible();

  await expander.click();
  await expect(list).toBeHidden();
  await expect(expander).toHaveAttribute('aria-expanded', 'false');

  await expander.click();
  await expect(list).toBeVisible();
  await expect(expander).toHaveAttribute('aria-expanded', 'true');
});

test('dom: the Follow-ups view shows the verdict breakdown, source chips and issue severity only', async ({
  page
}) => {
  const surface = await openSurface(page, 'followUpsMode', followUpsPayload());

  await expect(page.locator('.kpis .kpi-label')).toHaveText([
    FOLLOW_UPS.verdictPassed,
    FOLLOW_UPS.verdictPassedWithIssues,
    FOLLOW_UPS.verdictFailed
  ]);
  await expect(page.locator('.kpis .kpi-value')).toHaveText(['3', '1', '1']);

  const rows = page.locator('li.follow-up');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0).locator('.chip')).toHaveText([
    FOLLOW_UPS.sourceIssue,
    FOLLOW_UPS.severity.critical
  ]);
  await expect(rows.nth(1).locator('.chip')).toHaveText([FOLLOW_UPS.sourceRisk]);
  await expect(rows.nth(2).locator('.chip')).toHaveText([FOLLOW_UPS.sourceDeferred]);
  await expect(rows.nth(3).locator('.chip')).toHaveText([FOLLOW_UPS.sourceE2e]);
  await expect(page.locator('#show-resolved')).toHaveCount(0);

  await rows.nth(0).locator('.trow-title').click();
  expect(await surface.posted()).toContainEqual({
    type: 'openTask',
    folderUri: 'file:///tasks/.maister/tasks/development/auth-token-rotation'
  });
});

test('dom: a scoped Follow-ups view of an unfinished task shows the not-completed state', async ({
  page
}) => {
  await openSurface(page, 'followUpsMode', {
    ...followUpsPayload(),
    groups: [],
    scopedTitle: 'Auth token rotation',
    scopedNotCompleted: true
  });
  await expect(page.locator('p.empty')).toHaveText(FOLLOW_UPS.notCompleted);
  await expect(page.locator('section.follow-up-group')).toHaveCount(0);
});

test('dom: the Follow-ups view says how many task data files could not be read', async ({ page }) => {
  await openSurface(page, 'followUpsMode', followUpsPayload());
  await expect(page.locator('.follow-ups-unreadable')).toHaveCount(0);
  await openSurface(page, 'followUpsMode', { ...followUpsPayload(), unreadable: 2 });
  await expect(page.locator('.follow-ups-unreadable')).toHaveText(
    format(FOLLOW_UPS.unreadable, { n: 2 })
  );
});

const EDIT_PLAN = `${READER.edit} implementation-plan.md`;

test('dom: the artifact reader shows Edit outside the breadcrumb, between it and the hero chips in tab order', async ({
  page
}) => {
  await openSurface(page, 'reader', readerPayload());

  const edit = page.getByRole('button', { name: EDIT_PLAN, exact: true });
  await expect(edit).toHaveCount(1);
  await expect(page.locator('nav.rd-crumbs').getByRole('button', { name: READER.edit })).toHaveCount(0);
  await expect(edit).toHaveAttribute(
    'title',
    format(READER.editTitle, { file: 'implementation-plan.md' })
  );

  const names = (await focusables(page)).map((control) => control.name);
  expect(names.slice(1, 5)).toEqual([
    format(READER.breadcrumbTask, { title: 'Auth token rotation' }),
    EDIT_PLAN,
    'Specification',
    'Implementation Plan'
  ]);
});

test('dom: the artifact Edit button posts openSource for the shown artifact', async ({ page }) => {
  const surface = await openSurface(page, 'reader', readerPayload());

  await page.getByRole('button', { name: EDIT_PLAN, exact: true }).click();

  expect(await surface.posted()).toContainEqual({
    type: 'openSource',
    folderUri: 'file:///tasks/.maister/tasks/development/auth-token-rotation',
    artifactRelPath: 'implementation/implementation-plan.md'
  });
});

test('dom: a refused artifact shows both the header Edit button and the in-body Source button', async ({
  page
}) => {
  await openSurface(page, 'reader', readerPayload({ refused: true, notice: 'x', bodyHtml: '' }));

  await expect(page.getByRole('button', { name: EDIT_PLAN, exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: READER.openSource })).toHaveCount(1);
});

test('dom: a refused .html artifact has no Edit button, only the in-body Source button', async ({
  page
}) => {
  const html = readerPayload();
  await openSurface(
    page,
    'reader',
    readerPayload({
      location: { ...html.location, artifactRelPath: 'verification/implementation-verification.html' },
      refused: true,
      notice: 'x',
      bodyHtml: ''
    })
  );

  await expect(page.locator('.rd-head button.action')).toHaveCount(0);
  await expect(page.getByRole('button', { name: READER.openSource })).toHaveCount(1);
});

test('dom: a refused artifact reaches the header Edit button before the in-body Source button', async ({
  page
}) => {
  await openSurface(page, 'reader', readerPayload({ refused: true, notice: 'x', bodyHtml: '' }));

  const names = (await focusables(page)).map((control) => control.name);
  const edit = names.indexOf(EDIT_PLAN);
  expect(edit).toBeGreaterThan(0);
  expect(edit).toBeLessThan(names.indexOf(READER.openSource));
});

test('dom: the reader header row wraps at a narrow panel width without horizontal scroll', async ({
  page
}) => {
  await page.setViewportSize({ width: 250, height: 900 });
  for (const payload of [readerPayload(), readerDocPayload()]) {
    await openSurface(page, 'reader', payload);

    const box = await page.evaluate(() => {
      const edit = document.querySelector('.rd-head > button.action');
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        editRight: edit?.getBoundingClientRect().right ?? Infinity
      };
    });
    const label = payload.kind ?? 'artifact';
    expect(box.scrollWidth, `${label} reader`).toBeLessThanOrEqual(box.clientWidth);
    expect(box.editRight, `${label} Edit button`).toBeLessThanOrEqual(box.clientWidth);
  }
});
