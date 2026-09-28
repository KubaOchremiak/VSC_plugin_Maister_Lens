import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { hostDashboardHtml } from '../../src/panel/hostDashboard.ts';
import type { DocRenderPayload, RenderPayload } from '../../src/panel/render.ts';
import type { DashboardPayload } from '../../src/webview/dashboardMode.ts';
import type { FallbackPayload } from '../../src/webview/fallbackTask.ts';
import type { OverviewPayload } from '../../src/webview/overview.ts';
import type { ProjectPayload, ProjectSection } from '../../src/webview/projectMode.ts';
import type { FollowUpsPayload } from '../../src/webview/followUpsMode.ts';
import {
  DASHBOARD,
  FALLBACK,
  NOW,
  OVERVIEW,
  PANEL,
  PARSE,
  TIME,
  format
} from '../../src/strings.ts';

/**
 * A10's DOM harness. It loads a bundle's generated HTML in a browser page with
 * `acquireVsCodeApi` stubbed, so every message a simulated activation posts is captured, and
 * hands the spec a small structural vocabulary: control inventory, tab order and text order.
 * Nothing here renders images or compares pixels.
 */

export type BundleName = 'overview' | 'fallbackTask' | 'reader' | 'dashboardMode' | 'followUpsMode' | 'projectMode';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE_DASHBOARD = path.join(REPO_ROOT, 'test', 'fixtures', 'tasks', 'dev-real');

const pages = fs.mkdtempSync(path.join(os.tmpdir(), 'maister-lens-dom-'));
process.on('exit', () => fs.rmSync(pages, { recursive: true, force: true }));

export interface Surface {
  /** Everything the page has posted through the stubbed `acquireVsCodeApi`, oldest first. */
  posted(): Promise<unknown[]>;
  /** Posts another payload, exactly as the host would, and waits for the re-render. */
  post(payload: unknown): Promise<void>;
}

/**
 * The document the host builds around a bundle (`panel.ts` `bundleHtml`, `overviewView.ts`
 * `html`). The nonce and the webview CSP are host-side and are asserted by the integration
 * half of A16, so this shell carries only what the bundle itself renders into.
 */
function shellHtml(bundle: BundleName): string {
  const style = pathToFileURL(path.join(REPO_ROOT, 'media', 'webview.css')).href;
  const script = pathToFileURL(path.join(REPO_ROOT, 'dist', 'webview', `${bundle}.js`)).href;
  const root =
    bundle === 'overview'
      ? `<main id="root" aria-label="${OVERVIEW.title}"></main>`
      : '<div id="root"></div>';
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    `<link rel="stylesheet" href="${style}">`,
    `<title>${bundle}</title>`,
    '</head>',
    `<body class="${bundle === 'overview' ? '' : 'panel'}">`,
    root,
    `<script src="${script}"></script>`,
    '</body>',
    '</html>'
  ].join('\n');
}

interface StubbedWindow extends Window {
  __posted: unknown[];
}

async function stubVsCodeApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const posted: unknown[] = [];
    let state: unknown = null;
    (window as unknown as StubbedWindow).__posted = posted;
    (window as unknown as { acquireVsCodeApi: unknown }).acquireVsCodeApi = () => ({
      postMessage: (message: unknown) => posted.push(message),
      getState: () => state,
      setState: (next: unknown) => {
        state = next;
      }
    });
  });
}

function surfaceOf(page: Page): Surface {
  return {
    posted: () => page.evaluate(() => (window as unknown as StubbedWindow).__posted),
    post: async (payload: unknown) => {
      await page.evaluate(
        (message) =>
          new Promise<void>((resolve) => {
            window.postMessage(message, '*');
            setTimeout(resolve, 0);
          }),
        payload
      );
    }
  };
}

/** Loads one bundle's generated HTML and posts it the single payload it renders from. */
export async function openSurface(
  page: Page,
  bundle: BundleName,
  payload: unknown
): Promise<Surface> {
  const file = path.join(pages, `${bundle}.html`);
  fs.writeFileSync(file, shellHtml(bundle), 'utf8');
  await stubVsCodeApi(page);
  await page.goto(pathToFileURL(file).href);
  const surface = surfaceOf(page);
  await surface.post(payload);
  return surface;
}

/**
 * AC4's DOM half needs the real asset: Maister's own committed dashboard, hosted exactly as
 * § 5.2 hosts it — the three insertions, the shim, and the task's own `dashboard-data.js`.
 */
export async function openHostedDashboard(page: Page): Promise<Surface> {
  const dir = fs.mkdtempSync(path.join(pages, 'hosted-'));
  for (const name of ['dashboard.html', 'dashboard-data.js']) {
    fs.copyFileSync(path.join(FIXTURE_DASHBOARD, name), path.join(dir, name));
  }
  const hosted = hostDashboardHtml(fs.readFileSync(path.join(dir, 'dashboard.html'), 'utf8'), {
    cspSource: 'file:',
    baseHref: `${pathToFileURL(dir).href}/`,
    shimSrc: pathToFileURL(path.join(REPO_ROOT, 'dist', 'webview', 'shim.js')).href
  });
  if (hosted === null) {
    throw new Error('the fixture dashboard could not be hosted');
  }
  const file = path.join(dir, 'hosted.html');
  fs.writeFileSync(file, hosted, 'utf8');

  await stubVsCodeApi(page);
  await page.goto(pathToFileURL(file).href);
  return surfaceOf(page);
}

// --- structural vocabulary -------------------------------------------------

export interface Control {
  readonly tag: string;
  readonly name: string;
  readonly tabindex: string | null;
}

const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex], [role="button"], [role="link"]';

/** Every control a keyboard can reach, with the accessible name a screen reader would read. */
export async function focusables(page: Page): Promise<Control[]> {
  return page.evaluate((selector) => {
    const visibleText = (node: Element): string =>
      Array.from(node.childNodes)
        .map((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            return child.textContent ?? '';
          }
          if (child instanceof Element && child.getAttribute('aria-hidden') !== 'true') {
            return visibleText(child);
          }
          return '';
        })
        .join('')
        .trim();

    const accessibleName = (node: Element): string => {
      const label = node.getAttribute('aria-label');
      if (label !== null && label.trim() !== '') {
        return label.trim();
      }
      const labelledBy = node.getAttribute('aria-labelledby');
      if (labelledBy !== null) {
        const target = document.getElementById(labelledBy);
        if (target !== null) {
          return visibleText(target);
        }
      }
      if (node instanceof HTMLInputElement) {
        const own = node.labels?.[0];
        if (own !== undefined) {
          return visibleText(own);
        }
        return node.getAttribute('placeholder')?.trim() ?? '';
      }
      const text = visibleText(node);
      return text !== '' ? text : (node.getAttribute('title')?.trim() ?? '');
    };

    return Array.from(document.querySelectorAll(selector))
      .filter(
        (node) =>
          node.getAttribute('tabindex') !== '-1' &&
          !(node as HTMLElement).hasAttribute('disabled') &&
          node.checkVisibility()
      )
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        name: accessibleName(node),
        tabindex: node.getAttribute('tabindex')
      }));
  }, FOCUSABLE);
}

/**
 * Presses Tab `steps` times from the top of the document and reports which control, by its
 * position in document order, each press reached. `[0, 1, 2, …]` means the keyboard order is
 * the reading order.
 */
export async function tabOrder(page: Page, steps: number): Promise<number[]> {
  await page.evaluate((selector) => {
    // Chromium keeps a sequential-focus starting point, so a blur alone would resume from
    // wherever the bundle put focus; parking focus on the body restarts at the top.
    document.body.tabIndex = -1;
    document.body.focus();
    Array.from(document.querySelectorAll(selector))
      .filter((node) => node.getAttribute('tabindex') !== '-1' && node.checkVisibility())
      .forEach((node, order) => {
        (node as HTMLElement).dataset.tabProbe = String(order);
      });
  }, FOCUSABLE);

  const reached: number[] = [];
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press('Tab');
    reached.push(
      await page.evaluate(() =>
        Number((document.activeElement as HTMLElement | null)?.dataset.tabProbe ?? -1)
      )
    );
  }
  return reached;
}

/** The text of every match, in document order — the harness's field-order assertion. */
export async function texts(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes.map((node) => (node.textContent ?? '').trim())
  );
}

export async function headings(page: Page, selector: string): Promise<string[]> {
  return texts(page, selector);
}

// --- payload fixtures ------------------------------------------------------

export function fallbackPayload(overrides: Partial<FallbackPayload> = {}): FallbackPayload {
  return {
    type: 'task',
    folderUri: 'file:///tasks/.maister/tasks/development/auth-token-rotation',
    banner: PANEL.bannerNoDashboard,
    openInBrowser: true,
    dashboardRelPath: 'dashboard.html',
    title: 'Auth token rotation',
    typeLabel: 'Development',
    statusGlyph: '◯',
    statusText: 'In progress',
    verdict: FALLBACK.verdictNone,
    author: 'Marek Nowak',
    created: '1 Sep 2026',
    updated: '22 Sep 2026',
    parseIssues: [format(PARSE.dateOnly, { value: '2026-09-01' })],
    nextAction: { id: 'resume', label: 'Resume' },
    phases: [
      { id: 'phase-1', name: 'Specification', glyph: '✓', statusText: 'Completed' },
      { id: 'phase-2', name: 'Implementation', glyph: '●', statusText: 'Current' }
    ],
    heroes: [
      {
        artifactRelPath: 'implementation/spec.md',
        label: 'Specification',
        tldr: 'Rotate the refresh token on every use.',
        variant: 'md'
      }
    ],
    decisions: [
      {
        source: 'specification',
        items: [{ text: 'Rotate on every use', rationale: 'reuse detection needs a fresh token' }]
      }
    ],
    risks: [
      { text: 'Clock skew on token expiry', resolved: false, source: 'specification' },
      { text: 'Old sessions stay valid until expiry', resolved: true, source: 'specification' }
    ],
    files: [
      {
        artifactRelPath: 'implementation/spec.md',
        label: 'spec.md',
        folder: 'implementation',
        variant: 'md'
      }
    ],
    rawState: 'task:\n  title: Auth token rotation\n',
    ...overrides
  };
}

export function readerPayload(overrides: Partial<RenderPayload> = {}): RenderPayload {
  return {
    type: 'render',
    location: {
      mode: 'artifact',
      folderUri: 'file:///tasks/.maister/tasks/development/auth-token-rotation',
      artifactRelPath: 'implementation/implementation-plan.md',
      variant: 'md'
    },
    taskTitle: 'Auth token rotation',
    folderUri: 'file:///tasks/.maister/tasks/development/auth-token-rotation',
    artifactLabel: 'Implementation Plan',
    summary: {
      tldr: 'Rotate the refresh token on every use.',
      decisions: [
        {
          text: 'Rotate on every use',
          rationale: 'reuse detection needs a fresh token',
          source: 'implementation/implementation-plan.md'
        }
      ],
      risks: [
        {
          text: 'Clock skew on token expiry',
          resolved: true,
          source: 'implementation/implementation-plan.md'
        }
      ]
    },
    checklist: { done: 2, total: 5, skipped: 1 },
    bodyHtml:
      '<h1 id="implementation-plan">Implementation Plan</h1>' +
      '<p>See <a href="#" data-artifact="implementation/spec.md">the specification</a>.</p>',
    heroes: [
      { label: 'Specification', artifactRelPath: 'implementation/spec.md', current: false },
      {
        label: 'Implementation Plan',
        artifactRelPath: 'implementation/implementation-plan.md',
        current: true
      }
    ],
    notice: null,
    refused: false,
    ...overrides
  };
}

export function readerDocPayload(overrides: Partial<DocRenderPayload> = {}): DocRenderPayload {
  const docsFolderUri = 'file:///workspace/maister-lens/.maister/docs';
  return {
    type: 'render',
    kind: 'doc',
    location: { mode: 'doc', docsFolderUri, docRelPath: 'standards/global/coding-style.md' },
    docLabel: 'Coding Style',
    summary: null,
    checklist: null,
    bodyHtml:
      '<h1 id="coding-style">Coding Style</h1>' +
      '<p>See <a href="#" data-artifact="standards/global/commenting.md#rules">commenting.md</a>, ' +
      'and <a href="#" data-file="eslint.config.mjs">eslint.config.mjs</a>.</p>',
    notice: null,
    refused: false,
    ...overrides
  };
}

export function dashboardPayload(): DashboardPayload {
  return {
    type: 'dashboard',
    heading: DASHBOARD.heading,
    scope: format(DASHBOARD.scope, { total: 6 }),
    kpis: [
      {
        key: 'tasks',
        glyph: '▦',
        tone: 'blue',
        value: 6,
        label: DASHBOARD.kpiTasks,
        context: format(DASHBOARD.kpiTasksContext, { n: 2 })
      },
      {
        key: 'followUps',
        glyph: '☑',
        tone: 'purple',
        value: 3,
        label: DASHBOARD.kpiFollowUps,
        context: format(DASHBOARD.followUpsContext, { k: 2 })
      }
    ],
    charts: [
      {
        key: 'status',
        title: DASHBOARD.chartStatus,
        scope: format(DASHBOARD.scopeAll, { total: 6 }),
        facet: 'statuses',
        bars: [
          {
            key: 'completed',
            label: 'Completed',
            glyph: '✓',
            count: 2,
            tone: 'green',
            hatched: false,
            pressed: true
          },
          {
            key: 'in_progress',
            label: 'In progress',
            glyph: '◯',
            count: 4,
            tone: 'blue',
            hatched: false,
            pressed: false
          }
        ],
        weeks: [],
        footnote: null
      },
      {
        key: 'created',
        title: DASHBOARD.chartCreated,
        scope: DASHBOARD.scopeWeeks,
        facet: null,
        bars: [],
        weeks: [
          { label: 'W36', count: 2, current: false },
          { label: 'W37', count: 4, current: true }
        ],
        footnote: DASHBOARD.createdFootnoteNone
      }
    ],
    rows: [
      {
        folderUri: 'file:///tasks/.maister/tasks/development/auth-token-rotation',
        title: 'Auth token rotation',
        typeLabel: 'Development',
        statusGlyph: '◯',
        statusText: 'In progress',
        verdict: DASHBOARD.verdictNone,
        author: 'Marek Nowak',
        created: '1 Sep 2026',
        activity: '2d ago',
        nextAction: { id: 'resume', label: 'Resume' }
      },
      {
        folderUri: 'file:///tasks/.maister/tasks/research/pricing-page',
        title: 'Pricing page research',
        typeLabel: 'Research',
        statusGlyph: '✓',
        statusText: 'Completed',
        verdict: 'Passed',
        author: 'Me',
        created: '20 Aug 2026',
        activity: '9d ago',
        nextAction: null
      }
    ],
    rowLimit: 200,
    matched: 2,
    total: 6,
    filter: {
      chips: [{ key: 'statuses', label: 'Completed', patch: { statuses: [] } }],
      count: 1
    }
  };
}

export function followUpsPayload(): FollowUpsPayload {
  return {
    type: 'followUps',
    verdicts: { passed: 3, passedWithIssues: 1, failed: 1 },
    groups: [
      {
        folderUri: 'file:///tasks/.maister/tasks/development/auth-token-rotation',
        title: 'Auth token rotation',
        typeLabel: 'Development',
        verdict: 'Passed with issues',
        activity: '2d ago',
        items: [
          { text: 'Unescaped HTML in row', source: 'issue', severity: 'critical' },
          { text: 'Clock skew on token expiry', source: 'risk', severity: null },
          { text: 'Deferred the retry logic to a follow-up task', source: 'deferred', severity: null },
          { text: 'Run the E2E suite against a real workspace', source: 'e2e', severity: null }
        ]
      }
    ],
    scopedTitle: null,
    scopedNotCompleted: false,
    unreadable: 0
  };
}

export function projectSection(overrides: Partial<ProjectSection> = {}): ProjectSection {
  return {
    folderName: 'maister-lens',
    docsFolderUri: 'file:///workspace/maister-lens',
    tldr: {
      goal: 'A read-only view layer over Maister tasks.',
      goalSource: 'project/vision.md',
      techStack: 'TypeScript on the VS Code Extension API.',
      techStackSource: 'project/tech-stack.md'
    },
    groups: [
      { key: 'index', label: 'Index', docs: [{ relPath: 'INDEX.md', label: 'Index' }] },
      {
        key: 'project',
        label: 'Project',
        docs: [
          { relPath: 'project/tech-stack.md', label: 'Tech stack' },
          { relPath: 'project/vision.md', label: 'Vision' }
        ]
      },
      {
        key: 'standards/global',
        label: 'Standards · Global',
        docs: [{ relPath: 'standards/global/coding-style.md', label: 'Coding style' }]
      }
    ],
    ...overrides
  };
}

export function projectPayload(overrides: Partial<ProjectPayload> = {}): ProjectPayload {
  return { type: 'project', multiRoot: false, sections: [projectSection()], empty: false, ...overrides };
}

export function overviewPayload(): OverviewPayload {
  return {
    type: 'overview',
    stats: {
      status: [
        { key: 'in_progress', label: 'In progress', count: 1, pressed: false, glyph: '◯' },
        { key: 'completed', label: 'Completed', count: 1, pressed: false, glyph: '✓' }
      ],
      type: [{ key: 'development', label: 'Development', count: 1, pressed: false }],
      attention: [
        { key: 'failedVerification', label: OVERVIEW.attentionFailed, count: 0, pressed: false }
      ],
      total: 2,
      matched: 2,
      filterCount: 0,
      attributionEnabled: true,
      mine: true,
      quietDays: 3
    },
    groups: [
      {
        key: 'development',
        label: 'Development',
        count: 2,
        truncated: false,
        rows: [
          {
            folderUri: 'file:///tasks/.maister/tasks/development/auth-token-rotation',
            title: 'Auth token rotation',
            statusGlyph: '◯',
            statusText: 'In progress',
            description: format(NOW.taskDescription, {
              type: 'Development',
              phase: 'Executing implementation',
              activity: format(TIME.writtenMinutes, { n: 4 })
            }),
            markers: [],
            nextAction: { id: 'resume', label: 'Resume' },
            heroes: [
              { relPath: 'implementation/spec.md', label: 'Specification', variant: 'md' }
            ]
          },
          {
            folderUri: 'file:///tasks/.maister/tasks/research/pricing-page',
            title: 'Pricing page research',
            statusGlyph: '✓',
            statusText: 'Completed',
            description: format(NOW.taskDescription, {
              type: 'Research',
              phase: 'Completed',
              activity: '9d ago'
            }),
            markers: [],
            nextAction: null,
            heroes: []
          }
        ]
      }
    ],
    activeFilter: { text: '' },
    groupBy: 'type',
    freshness: 'fresh'
  };
}
