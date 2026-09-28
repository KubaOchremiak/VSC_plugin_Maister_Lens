import type { FollowUpSource, IssueSeverity } from '../model/followUps.ts';
import { FOLLOW_UPS, format, unreadableText } from '../strings.ts';
import { el, glyph, kpi, row, type ChipOptions } from './components.ts';

/**
 * What completed tasks left open — unfixed verification issues, unresolved risks, deferred
 * decisions and E2E follow-ups — grouped by task, under the verdict breakdown of the
 * completed tasks in scope. The host sends everything; nothing is dismissed or stored.
 */

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

export interface FollowUpRow {
  readonly text: string;
  readonly source: FollowUpSource;
  readonly severity: IssueSeverity | null;
}

export interface FollowUpsGroup {
  readonly folderUri: string;
  readonly title: string;
  readonly typeLabel: string;
  readonly verdict: string | null;
  readonly activity: string;
  readonly items: readonly FollowUpRow[];
}

export interface FollowUpsPayload {
  readonly type: 'followUps';
  readonly verdicts: {
    readonly passed: number;
    readonly passedWithIssues: number;
    readonly failed: number;
  };
  readonly groups: readonly FollowUpsGroup[];
  /** The task the view is scoped to, when it was opened from one. */
  readonly scopedTitle: string | null;
  /** True when the scoped task is not completed yet, so it cannot carry follow-ups. */
  readonly scopedNotCompleted: boolean;
  /** Completed tasks whose `dashboard-data.js` could not be read, so their issues are missing. */
  readonly unreadable: number;
}

interface LocalState {
  collapsed: Record<string, boolean>;
}

const EXPANDED_BY_DEFAULT = 10;

const SOURCE_LABELS: Record<FollowUpSource, string> = {
  issue: FOLLOW_UPS.sourceIssue,
  risk: FOLLOW_UPS.sourceRisk,
  deferred: FOLLOW_UPS.sourceDeferred,
  e2e: FOLLOW_UPS.sourceE2e
};

const SEVERITY_TONES: Record<IssueSeverity, ChipOptions['tone']> = {
  critical: 'error',
  warning: 'warn',
  info: 'neutral'
};

const api = acquireVsCodeApi();

function post(message: unknown): void {
  api.postMessage(message);
}

function readState(): LocalState {
  const stored = api.getState() as Partial<LocalState> | null | undefined;
  const collapsed = stored?.collapsed;
  return { collapsed: typeof collapsed === 'object' && collapsed !== null ? collapsed : {} };
}

let state = readState();

function saveCollapsed(folderUri: string, collapsed: boolean): void {
  state = { collapsed: { ...state.collapsed, [folderUri]: collapsed } };
  api.setState(state);
}

function verdictTiles(payload: FollowUpsPayload): HTMLElement {
  const tiles = el('div', { class: 'kpis', role: 'group', 'aria-label': FOLLOW_UPS.verdictsLabel });
  tiles.append(
    kpi({
      glyph: '✓',
      tone: 'green',
      value: payload.verdicts.passed,
      label: FOLLOW_UPS.verdictPassed,
      context: FOLLOW_UPS.verdictContext
    }),
    kpi({
      glyph: '⚠',
      tone: 'orange',
      value: payload.verdicts.passedWithIssues,
      label: FOLLOW_UPS.verdictPassedWithIssues,
      context: FOLLOW_UPS.verdictContext
    }),
    kpi({
      glyph: '✕',
      tone: 'red',
      value: payload.verdicts.failed,
      label: FOLLOW_UPS.verdictFailed,
      context: FOLLOW_UPS.verdictContext
    })
  );
  return tiles;
}

/** Issue and E2E rows open the task's dashboard, Risk and Deferred rows the task: both are `openTask`. */
function followUpRow(group: FollowUpsGroup, item: FollowUpRow): HTMLLIElement {
  const markers: ChipOptions[] = [{ text: SOURCE_LABELS[item.source], tone: 'neutral' }];
  if (item.source === 'issue' && item.severity !== null) {
    markers.push({ text: FOLLOW_UPS.severity[item.severity], tone: SEVERITY_TONES[item.severity] });
  }
  const line = row({
    title: item.text,
    statusGlyph: item.source === 'issue' ? '⚠' : '•',
    statusText: SOURCE_LABELS[item.source],
    description: '',
    markers,
    onOpen: () => post({ type: 'openTask', folderUri: group.folderUri })
  });
  line.classList.add('follow-up', `follow-up-${item.source}`);
  return line;
}

function groupHeader(group: FollowUpsGroup, list: HTMLElement, expanded: boolean): HTMLElement {
  const head = el('div', { class: 'follow-up-group-head' });

  const expander = el('button', { class: 'expander', type: 'button' }, [
    glyph(expanded ? '▾' : '▸')
  ]);
  expander.setAttribute('aria-expanded', String(expanded));
  expander.setAttribute('aria-label', format(FOLLOW_UPS.groupLabel, { title: group.title }));
  expander.addEventListener('click', () => {
    const open = expander.getAttribute('aria-expanded') !== 'true';
    expander.setAttribute('aria-expanded', String(open));
    expander.replaceChildren(glyph(open ? '▾' : '▸'));
    list.hidden = !open;
    saveCollapsed(group.folderUri, !open);
  });

  const title = el('button', { class: 'follow-up-group-title', type: 'button' }, [group.title]);
  title.setAttribute('aria-label', format(FOLLOW_UPS.openTaskLabel, { title: group.title }));
  title.addEventListener('click', () => post({ type: 'openTask', folderUri: group.folderUri }));

  const count = group.items.length;
  head.append(
    expander,
    title,
    el('span', { class: 'dim' }, [
      [group.typeLabel, group.verdict, group.activity]
        .filter((part) => part !== null && part !== '')
        .join(' · ')
    ]),
    el('span', { class: 'follow-up-count' }, [
      count === 1 ? FOLLOW_UPS.countOne : format(FOLLOW_UPS.count, { n: count })
    ])
  );
  return head;
}

function groupCard(group: FollowUpsGroup, position: number): HTMLElement {
  const stored = state.collapsed[group.folderUri];
  const expanded = stored === undefined ? position < EXPANDED_BY_DEFAULT : !stored;
  const list = el('ul', { class: 'plain follow-ups' });
  for (const item of group.items) {
    list.append(followUpRow(group, item));
  }
  list.hidden = !expanded;
  return el('section', { class: 'card follow-up-group' }, [
    groupHeader(group, list, expanded),
    list
  ]);
}

export function render(payload: FollowUpsPayload, root: HTMLElement): void {
  const fragment = document.createDocumentFragment();

  const crumb = el('button', { class: 'link', type: 'button' }, [FOLLOW_UPS.breadcrumb]);
  crumb.addEventListener('click', () => post({ type: 'openDashboard' }));
  fragment.append(el('nav', { 'aria-label': FOLLOW_UPS.breadcrumbLabel }, [crumb]));

  const total = payload.groups.reduce((sum, group) => sum + group.items.length, 0);
  fragment.append(
    el('div', { class: 'head' }, [
      el('h1', {}, [FOLLOW_UPS.heading]),
      el('span', { class: 'dim' }, [
        format(FOLLOW_UPS.summary, { n: total, k: payload.groups.length })
      ]),
      payload.scopedTitle === null
        ? null
        : el('span', { class: 'dim' }, [
            format(FOLLOW_UPS.scopedTo, { title: payload.scopedTitle })
          ]),
      payload.unreadable === 0
        ? null
        : el('span', { class: 'dim follow-ups-unreadable' }, [
            unreadableText(payload.unreadable)
          ])
    ])
  );

  if (payload.scopedNotCompleted) {
    fragment.append(el('p', { class: 'empty' }, [FOLLOW_UPS.notCompleted]));
    root.replaceChildren(fragment);
    return;
  }

  fragment.append(verdictTiles(payload));
  if (payload.groups.length === 0) {
    fragment.append(el('p', { class: 'empty' }, [FOLLOW_UPS.empty]));
  } else {
    const groups = el('div', { class: 'follow-up-groups' });
    payload.groups.forEach((group, position) => groups.append(groupCard(group, position)));
    fragment.append(groups);
  }
  root.replaceChildren(fragment);
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'followUps'
  ) {
    const root = document.getElementById('root');
    if (root !== null) {
      render(message as FollowUpsPayload, root);
    }
  }
});

post({ type: 'ready' });
