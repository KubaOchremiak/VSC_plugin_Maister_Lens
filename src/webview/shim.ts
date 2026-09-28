/**
 * § 5.3 — the shim runs before Maister's own dashboard script inside the hosted page. It is
 * the only code the extension adds to that page, and the only chrome it injects there is a
 * single host-owned element, the back link: it claims the messaging API, carries its nonce
 * over to the dashboard's data script, bridges refreshes, prepends that one back link to the
 * body and turns every link into a `navigate` message the host validates.
 */

import { FALLBACK, SHIM } from '../strings.ts';

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

interface MaisterData {
  readonly task?: { readonly title?: string };
}

interface HostedWindow extends Window {
  MAISTER_DATA?: MaisterData;
  loadData?: (initial: boolean) => void;
}

/** VS Code allows one `acquireVsCodeApi()` per page, so the data file can never get a handle. */
const vscodeApi = acquireVsCodeApi();
const shimNonce = (document.currentScript as HTMLScriptElement | null)?.nonce ?? '';
const hosted = window as HostedWindow;

/** How long to wait for the dashboard's own loader before reporting readiness regardless. */
const DATA_SCRIPT_BUDGET_MS = 5_000;

let reported = false;

/**
 * `ready` per the A2 table. Its extra fields are diagnostics for the A18 regression test —
 * the host cannot read this page's DOM (A16) — and the validator ignores unknown keys.
 */
function reportReady(dataSrc: string, dataLoaded: boolean, failure: string | null): void {
  if (reported) {
    return;
  }
  reported = true;
  vscodeApi.postMessage({
    type: 'ready',
    dataSrc,
    dataLoaded,
    failure,
    taskTitle: hosted.MAISTER_DATA?.task?.title ?? ''
  });
}

const DATA_SCRIPT = 'dashboard-data.js';

/**
 * Only the task folder's own data file, never a name that merely contains it: the nonce is
 * the one thing that can move a script past `default-src 'none'`, so the resolved URL must
 * be exactly the file the `<base>` insertion points at. Everything but the query string is
 * compared, which keeps the dashboard's `?t=<epoch>` cache-buster working.
 *
 * The comparison is against the base, not `location`: a VS Code webview document and its
 * resource origin are different by design (`vscode-webview:` vs `webview.cspSource`).
 */
function isDataScript(src: string): boolean {
  try {
    const url = new URL(src, document.baseURI);
    const allowed = new URL(DATA_SCRIPT, document.baseURI);
    return url.origin === allowed.origin && url.pathname === allowed.pathname;
  } catch {
    return false;
  }
}

/**
 * The dashboard appends `<script src="dashboard-data.js?t=…">`, which the CSP would block
 * for want of a nonce. The `<base>` insertion resolves the relative src, cache-buster and
 * all; this carries the shim's nonce over so the page may execute it.
 */
function adoptDataScript(node: Node): void {
  if (!(node instanceof HTMLScriptElement)) {
    return;
  }
  const src = node.getAttribute('src');
  if (src === null || !isDataScript(src)) {
    return;
  }

  node.setAttribute('nonce', shimNonce);
  node.nonce = shimNonce;
  node.addEventListener('load', () => reportReady(src, true, null));
  node.addEventListener('error', () =>
    reportReady(src, false, `the webview refused to load ${node.src}`)
  );
}

const nativeAppendChild = Node.prototype.appendChild;
Node.prototype.appendChild = function appendChild<T extends Node>(this: Node, node: T): T {
  adoptDataScript(node);
  return nativeAppendChild.call(this, node) as T;
};

const nativeInsertBefore = Node.prototype.insertBefore;
Node.prototype.insertBefore = function insertBefore<T extends Node>(
  this: Node,
  node: T,
  child: Node | null
): T {
  adoptDataScript(node);
  return nativeInsertBefore.call(this, node, child) as T;
};

window.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
  if (event.data?.type === 'refresh') {
    hosted.loadData?.(false);
  }
});

/** Every link leaves the page through the host, which alone decides where it may go. */
function interceptLink(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const anchor = target.closest('a[href]');
  if (anchor === null) {
    return;
  }
  const href = anchor.getAttribute('href') ?? '';
  if (href.startsWith('#')) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  vscodeApi.postMessage({ type: 'navigate', href });
}

document.addEventListener('click', interceptLink, true);
document.addEventListener('auxclick', interceptLink, true);

window.open = function open(url?: string | URL): null {
  vscodeApi.postMessage({ type: 'navigate', href: String(url ?? '') });
  return null;
};

/**
 * Visual properties the injected chrome depends on, as [property, value, priority].
 * The page carries arbitrary task-author CSS, so every property that can suppress an element
 * — hide it, collapse its box, move it out of the viewport, clip it or swallow its clicks —
 * is set with `important`; an inline declaration without it still loses to a page rule marked
 * `!important`. Purely cosmetic properties stay at normal priority so a dashboard's own theme
 * can still influence them. `z-index` is paired with `position: relative` because it is inert
 * on a statically positioned box. A page can still cover the link with its own stacked overlay;
 * the editor title-bar Open Dashboard button is the guaranteed route back.
 */
const CRITICAL = 'important';

const BUTTON_STYLE: ReadonlyArray<readonly [string, string, string?]> = [
  ['display', 'inline-block', CRITICAL],
  ['visibility', 'visible', CRITICAL],
  ['opacity', '1', CRITICAL],
  ['pointer-events', 'auto', CRITICAL],
  ['position', 'static', CRITICAL],
  ['left', 'auto', CRITICAL],
  ['right', 'auto', CRITICAL],
  ['top', 'auto', CRITICAL],
  ['bottom', 'auto', CRITICAL],
  ['float', 'none', CRITICAL],
  ['font-size', '13px', CRITICAL],
  ['line-height', '1.4', CRITICAL],
  ['transform', 'none', CRITICAL],
  ['clip-path', 'none', CRITICAL],
  ['content-visibility', 'visible', CRITICAL],
  ['width', 'auto', CRITICAL],
  ['height', 'auto', CRITICAL],
  ['min-width', '0', CRITICAL],
  ['min-height', '0', CRITICAL],
  ['max-width', 'none', CRITICAL],
  ['max-height', 'none', CRITICAL],
  ['text-indent', '0', CRITICAL],
  ['margin', '0'],
  ['padding', '0'],
  ['font-family', 'inherit'],
  ['color', 'var(--vscode-textLink-foreground, #3794ff)'],
  ['background', 'none'],
  ['border', 'none'],
  ['text-decoration', 'none'],
  ['cursor', 'pointer']
];

const NAV_STYLE: ReadonlyArray<readonly [string, string, string?]> = [
  ['display', 'block', CRITICAL],
  ['visibility', 'visible', CRITICAL],
  ['opacity', '1', CRITICAL],
  ['pointer-events', 'auto', CRITICAL],
  ['position', 'relative', CRITICAL],
  ['z-index', '2147483647', CRITICAL],
  ['transform', 'none', CRITICAL],
  ['clip-path', 'none', CRITICAL],
  ['content-visibility', 'visible', CRITICAL],
  ['overflow', 'visible', CRITICAL],
  ['float', 'none', CRITICAL],
  ['width', 'auto', CRITICAL],
  ['height', 'auto', CRITICAL],
  ['min-width', '0', CRITICAL],
  ['min-height', '0', CRITICAL],
  ['max-width', 'none', CRITICAL],
  ['max-height', 'none', CRITICAL],
  ['left', 'auto', CRITICAL],
  ['right', 'auto', CRITICAL],
  ['top', 'auto', CRITICAL],
  ['bottom', 'auto', CRITICAL],
  ['text-indent', '0', CRITICAL],
  ['margin', '0 0 12px 0'],
  ['padding', '8px 12px'],
  ['background', 'var(--vscode-editor-background, transparent)'],
  ['border', 'none']
];

function applyStyle(
  element: HTMLElement,
  declarations: ReadonlyArray<readonly [string, string, string?]>
): void {
  for (const [property, value, priority] of declarations) {
    element.style.setProperty(property, value, priority ?? '');
  }
}

function backLink(): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = SHIM.lensBack;
  applyStyle(button, BUTTON_STYLE);

  button.addEventListener('click', (event: MouseEvent) => {
    event.stopPropagation();
    vscodeApi.postMessage({ type: 'openDashboard' });
  });

  const nav = document.createElement('nav');
  nav.className = 'maister-lens-back';
  nav.setAttribute('aria-label', FALLBACK.breadcrumbLabel);
  applyStyle(nav, NAV_STYLE);
  nav.append(button);
  return nav;
}

function injectBackLink(): void {
  const body = document.body;
  if (!body) {
    return;
  }
  body.insertBefore(backLink(), body.firstChild);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectBackLink);
} else {
  injectBackLink();
}

setTimeout(
  () => reportReady('', false, 'the dashboard appended no data script'),
  DATA_SCRIPT_BUDGET_MS
);
