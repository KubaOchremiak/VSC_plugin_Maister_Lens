import { strict as assert } from 'node:assert';
import { TaskPanel } from '../../src/panel/panel.ts';
import type { FallbackPayload } from '../../src/webview/fallbackTask.ts';
import { FALLBACK, PANEL } from '../../src/strings.ts';
import {
  folderStubs,
  folderUriOf,
  makeIndex,
  makeTempDir,
  removeTempDirs,
  stubContext,
  writeTask
} from '../helpers/tempWorkspace.ts';

after(() => removeTempDirs());

describe('fallbackTask/integration', () => {
  it('the html_output:false task payload carries the banner reason, phases, decisions and risks (AC6)', async function () {
    this.timeout(60_000);

    const workspace = makeTempDir('fallback');
    const dir = writeTask(workspace, 'development', 'auth-rotation', {
      title: 'Auth token rotation',
      risks: [
        'Mobile clients on v3.x cannot handle a rotated token',
        'resolved: Clock skew on token expiry'
      ],
      decisions: ['Rotate on every use'],
      artifacts: [{ relPath: 'implementation/spec.md', label: 'Specification' }]
    });
    const folderUri = folderUriOf(dir);
    const index = makeIndex([workspace], makeTempDir('fallback-storage'));
    await index.index.load();

    const posted: unknown[] = [];
    const panel = new TaskPanel({
      context: stubContext(),
      index: index.index,
      log: () => undefined,
      folders: () => folderStubs([workspace])
    });
    panel.onDidPost((message) => posted.push(message));

    try {
      await panel.show({ mode: 'task', folderUri });
      assert.equal(panel.isHosting, false, 'a task without a dashboard was hosted');

      const payload = posted.find(
        (message) => (message as { type?: string }).type === 'task'
      ) as FallbackPayload | undefined;
      assert.ok(payload !== undefined, `no task payload was posted: ${JSON.stringify(posted)}`);

      assert.equal(payload.banner, PANEL.bannerNoDashboard);
      assert.equal(payload.openInBrowser, false, 'a task with no dashboard offered the browser button');

      assert.ok(payload.phases.length > 0, 'the payload carries no phases');
      assert.ok(
        payload.phases.every((phase) => phase.glyph !== '' && phase.statusText !== ''),
        'a phase glyph carries no text beside it'
      );

      assert.ok(payload.decisions.length > 0, 'the payload carries no decisions');
      assert.ok(
        payload.decisions.some((group) =>
          group.items.some((item) => item.text.includes('Rotate on every use'))
        ),
        `the recorded decision is missing: ${JSON.stringify(payload.decisions)}`
      );
      assert.ok(
        payload.decisions.every((group) => group.source !== ''),
        'decisions are not grouped by source'
      );

      assert.equal(
        new Set(payload.risks.map((risk) => risk.text.trim().toLowerCase())).size,
        payload.risks.length,
        'the fallback view lists a risk twice'
      );
      assert.ok(
        payload.risks.some((risk) => risk.text.includes('Mobile clients')),
        `the recorded risk is missing: ${JSON.stringify(payload.risks)}`
      );
      assert.deepEqual(
        payload.risks.map((risk) => risk.resolved),
        [...payload.risks.map((risk) => risk.resolved)].sort((left, right) =>
          Number(left) - Number(right)
        ),
        'resolved risks are not ordered after the open ones'
      );
    } finally {
      panel.dispose();
      index.dispose();
    }
  });
});

class StubNode {
  private readonly parts: (StubNode | string)[] = [];
  private readonly attributes = new Map<string, string>();
  private readonly listeners: (() => void)[] = [];

  constructor(readonly tagName: string) {}

  get children(): StubNode[] {
    return this.parts.filter((part): part is StubNode => typeof part !== 'string');
  }

  get textContent(): string {
    return this.parts
      .map((part) => (typeof part === 'string' ? part : part.textContent))
      .join('');
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, handler: () => void): void {
    if (type === 'click') {
      this.listeners.push(handler);
    }
  }

  click(): void {
    for (const handler of [...this.listeners]) {
      handler();
    }
  }

  append(...items: (StubNode | string | null | undefined)[]): void {
    for (const item of items) {
      if (item === null || item === undefined) {
        continue;
      }
      if (typeof item !== 'string' && item.tagName === '#fragment') {
        this.append(...item.parts);
        continue;
      }
      this.parts.push(item);
    }
  }

  replaceChildren(...items: (StubNode | string)[]): void {
    this.parts.length = 0;
    this.append(...items);
  }
}

interface RenderResult {
  readonly root: StubNode;
  readonly posted: unknown[];
}

function minimalPayload(): FallbackPayload {
  return {
    type: 'task',
    folderUri: 'file:///tmp/empty-task',
    banner: 'This task has no dashboard.',
    openInBrowser: false,
    dashboardRelPath: '',
    title: 'Empty task',
    typeLabel: 'development',
    statusGlyph: '◯',
    statusText: 'In progress',
    verdict: 'none yet',
    author: 'nobody',
    created: 'today',
    updated: 'today',
    parseIssues: [],
    nextAction: null,
    phases: [],
    heroes: [],
    decisions: [],
    risks: [],
    files: [],
    rawState: ''
  };
}

const postedMessages: unknown[] = [];

/**
 * The bundle calls `acquireVsCodeApi()` at module scope and captures the handle once, so the
 * stubs must exist before the module is first imported anywhere in this mocha process, and the
 * module must be loaded exactly once. Both happen in `before()`; `renderFallback()` then only
 * renders.
 */
let bundle: typeof import('../../src/webview/fallbackTask.ts') | undefined;

/**
 * The extension host has no `document`, and the project carries no DOM library, so the few node
 * operations `el()` and `render()` perform are stubbed here rather than pulled in as a dependency.
 */
function installDomStubs(): void {
  const globals = globalThis as Record<string, unknown>;
  globals.document = {
    createElement: (tag: string) => new StubNode(tag),
    createDocumentFragment: () => new StubNode('#fragment'),
    createTextNode: (text: string) => {
      const node = new StubNode('#text');
      node.append(text);
      return node;
    },
    getElementById: () => null
  };
  globals.window = { addEventListener: () => undefined };
  globals.acquireVsCodeApi = () => ({
    postMessage: (message: unknown) => postedMessages.push(message)
  });
}

function renderFallback(payload: FallbackPayload): RenderResult {
  assert.ok(bundle, 'the fallbackTask bundle was not loaded by before()');
  const root = new StubNode('div');
  postedMessages.length = 0;
  bundle.render(payload, root as unknown as HTMLElement);
  return { root, posted: postedMessages };
}

describe('fallbackTask/breadcrumb', () => {
  before(async () => {
    installDomStubs();
    assert.equal(
      typeof (globalThis as Record<string, unknown>).acquireVsCodeApi,
      'function',
      'the acquireVsCodeApi stub must exist before the bundle is imported'
    );
    bundle = await import('../../src/webview/fallbackTask.ts');
  });

  after(() => {
    const globals = globalThis as Record<string, unknown>;
    delete globals.document;
    delete globals.window;
    delete globals.acquireVsCodeApi;
  });

  it('renders a <nav> labelled by FALLBACK.breadcrumbLabel as the first node (FR3 AC3)', async () => {
    const { root } = renderFallback(minimalPayload());
    const first = root.children[0];
    assert.ok(first !== undefined, 'render() appended nothing');
    assert.equal(first.tagName, 'nav');
    assert.equal(first.getAttribute('aria-label'), FALLBACK.breadcrumbLabel);
  });

  it('wraps a link-styled <button> carrying FALLBACK.breadcrumb (FR3 AC1, AC6)', async () => {
    const { root } = renderFallback(minimalPayload());
    const crumb = root.children[0].children[0];
    assert.ok(crumb !== undefined, 'the nav holds no control');
    assert.equal(crumb.tagName, 'button');
    assert.equal(crumb.getAttribute('type'), 'button');
    assert.equal(crumb.getAttribute('class'), 'link');
    assert.equal(crumb.getAttribute('tabindex'), null);
    assert.equal(crumb.textContent, FALLBACK.breadcrumb);
  });

  it('posts exactly { type: "openDashboard" } when the breadcrumb is clicked (FR3 AC2)', async () => {
    const { root, posted } = renderFallback(minimalPayload());
    root.children[0].children[0].click();
    assert.deepEqual(posted, [{ type: 'openDashboard' }]);
  });

  it('renders the breadcrumb unconditionally, with no risks, decisions or artifacts (FR3 AC4)', async () => {
    const payload = minimalPayload();
    assert.deepEqual([payload.risks, payload.decisions, payload.files, payload.heroes], [[], [], [], []]);
    const { root } = renderFallback(payload);
    assert.equal(root.children[0].tagName, 'nav');
    assert.equal(root.children[0].children[0].textContent, FALLBACK.breadcrumb);
  });
});
