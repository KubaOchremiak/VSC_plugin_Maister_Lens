import { RISKS, format } from '../strings.ts';
import { chip, el, glyph, kpi, tile, type Tone } from './components.ts';

/**
 * § 5.7 — every open risk across the indexed tasks, grouped by the task that recorded it.
 * The host sends the **full** risk set for the scope (A5, A2), so the text search, the task
 * status toggles, Show resolved and Group by all run here without a round-trip; only the
 * type facet is shared with Overview and Dashboard and goes back through `setFilter`.
 *
 * Maister records no severity and no risk date, so neither is shown or ranked on.
 */

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

export interface RiskRow {
  readonly text: string;
  readonly resolved: boolean;
  /** The artifact path or the `phase_summaries` key that recorded it. */
  readonly source: string;
  readonly sourceKind: 'state' | 'artifact';
  /** Set only for an artifact source, so the source line can open the reader. */
  readonly artifactRelPath: string | null;
}

export interface RiskGroup {
  readonly folderUri: string;
  readonly title: string;
  readonly typeKey: string;
  readonly typeLabel: string;
  readonly statusGlyph: string;
  readonly statusText: string;
  readonly verdict: string | null;
  readonly activity: string;
  readonly author: string;
  readonly openCount: number;
  readonly unfinished: boolean;
  readonly nextAction: { readonly id: string; readonly label: string } | null;
  readonly risks: readonly RiskRow[];
}

export interface RisksKpi {
  readonly key: 'openRisks' | 'unfinished' | 'completed' | 'failedVerification';
  readonly glyph: string;
  readonly tone: Tone;
  readonly value: number;
  readonly label: string;
  readonly context: string;
}

export interface RiskTypeFacet {
  readonly key: string;
  readonly label: string;
  readonly pressed: boolean;
}

export interface RisksPayload {
  readonly type: 'risks';
  readonly kpis: readonly RisksKpi[];
  readonly groups: readonly RiskGroup[];
  readonly typeFacets: readonly RiskTypeFacet[];
  /** The task Risks mode is scoped to, when it was opened from one. */
  readonly scopedTitle: string | null;
}

type GroupBy = 'task' | 'type' | 'source';

interface LocalState {
  search: string;
  unfinished: boolean;
  completed: boolean;
  showResolved: boolean;
  groupBy: GroupBy;
  collapsed: Record<string, boolean>;
}

const GROUP_BY_VALUES: readonly GroupBy[] = ['task', 'type', 'source'];
const EXPANDED_BY_DEFAULT = 10;
const GROUPS_SHOWN = 50;
const SEARCH_DEBOUNCE_MS = 200;

const api = acquireVsCodeApi();

function post(message: unknown): void {
  api.postMessage(message);
}

function readState(): LocalState {
  const fallback: LocalState = {
    search: '',
    unfinished: true,
    completed: true,
    showResolved: false,
    groupBy: 'task',
    collapsed: {}
  };
  const stored = api.getState();
  if (stored === null || typeof stored !== 'object') {
    return fallback;
  }
  const candidate = stored as Partial<LocalState>;
  return {
    search: typeof candidate.search === 'string' ? candidate.search : fallback.search,
    unfinished: candidate.unfinished !== false,
    completed: candidate.completed !== false,
    showResolved: candidate.showResolved === true,
    groupBy: GROUP_BY_VALUES.includes(candidate.groupBy as GroupBy)
      ? (candidate.groupBy as GroupBy)
      : 'task',
    collapsed:
      typeof candidate.collapsed === 'object' && candidate.collapsed !== null
        ? candidate.collapsed
        : {}
  };
}

let state = readState();
let current: RisksPayload | null = null;

function saveState(patch: Partial<LocalState>): void {
  state = { ...state, ...patch };
  api.setState(state);
}

interface VisibleGroup {
  readonly key: string;
  readonly group: RiskGroup;
  readonly risks: readonly RiskRow[];
}

/** The local filters of § 5.7: risk text, task status and Show resolved. */
function visibleRisks(group: RiskGroup): RiskRow[] {
  const needle = state.search.trim().toLowerCase();
  return group.risks.filter((risk) => {
    if (!state.showResolved && risk.resolved) {
      return false;
    }
    return needle === '' || risk.text.toLowerCase().includes(needle);
  });
}

function admitsStatus(group: RiskGroup): boolean {
  return group.unfinished ? state.unfinished : state.completed;
}

/**
 * Group by Task keeps the host's `activityMtime` order. The other two re-bucket the same
 * rows; each bucket keeps the order of the first task that reached it, so the ordering rule
 * of § 5.7 still holds.
 */
function visibleGroups(payload: RisksPayload): VisibleGroup[] {
  const admitted = payload.groups
    .filter(admitsStatus)
    .map((group) => ({ group, risks: visibleRisks(group) }))
    .filter((entry) => entry.risks.length > 0);

  if (state.groupBy === 'task') {
    return admitted.map((entry) => ({ key: entry.group.folderUri, ...entry }));
  }

  const buckets = new Map<string, VisibleGroup>();
  for (const entry of admitted) {
    for (const risk of entry.risks) {
      const key = state.groupBy === 'type' ? entry.group.typeLabel : risk.source;
      const existing = buckets.get(key);
      if (existing === undefined) {
        buckets.set(key, { key, group: entry.group, risks: [risk] });
        continue;
      }
      buckets.set(key, { ...existing, risks: [...existing.risks, risk] });
    }
  }
  return [...buckets.values()];
}

function searchBox(): HTMLElement {
  const input = el('input', {
    id: 'risk-search',
    class: 'search',
    type: 'search',
    placeholder: RISKS.searchPlaceholder,
    'aria-label': RISKS.searchLabel
  });
  input.value = state.search;
  let timer: number | undefined;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      saveState({ search: input.value });
      draw();
      document.getElementById('risk-search')?.focus();
    }, SEARCH_DEBOUNCE_MS);
  });
  return input;
}

function typeChips(payload: RisksPayload): HTMLElement {
  const group = el('div', { class: 'tiles', role: 'group', 'aria-label': RISKS.typeLabel });
  for (const facet of payload.typeFacets) {
    group.append(
      tile({
        label: facet.label,
        pressed: facet.pressed,
        // The one facet that leaves the webview: it is shared with Overview and Dashboard.
        onToggle: () =>
          post({
            type: 'setFilter',
            patch: {
              types: facet.pressed
                ? payload.typeFacets
                    .filter((candidate) => candidate.pressed && candidate.key !== facet.key)
                    .map((candidate) => candidate.key)
                : [
                    ...payload.typeFacets
                      .filter((candidate) => candidate.pressed)
                      .map((candidate) => candidate.key),
                    facet.key
                  ]
            }
          })
      })
    );
  }
  return group;
}

function statusToggles(): HTMLElement {
  const group = el('div', { class: 'tiles', role: 'group', 'aria-label': RISKS.statusLabel });
  group.append(
    tile({
      label: RISKS.statusUnfinished,
      pressed: state.unfinished,
      onToggle: () => {
        saveState({ unfinished: !state.unfinished });
        draw();
      }
    }),
    tile({
      label: RISKS.statusCompleted,
      pressed: state.completed,
      onToggle: () => {
        saveState({ completed: !state.completed });
        draw();
      }
    })
  );
  return group;
}

function showResolvedToggle(): HTMLElement {
  const input = el('input', { type: 'checkbox', id: 'show-resolved' });
  input.checked = state.showResolved;
  input.addEventListener('change', () => {
    saveState({ showResolved: input.checked });
    draw();
  });
  return el('label', { class: 'checkbox', for: 'show-resolved' }, [input, RISKS.showResolved]);
}

function groupByToggles(): HTMLElement {
  const group = el('div', { class: 'tiles', role: 'group', 'aria-label': RISKS.groupByLabel });
  const labels: Record<GroupBy, string> = {
    task: RISKS.groupByTask,
    type: RISKS.groupByType,
    source: RISKS.groupBySource
  };
  for (const value of GROUP_BY_VALUES) {
    group.append(
      tile({
        label: labels[value],
        pressed: state.groupBy === value,
        onToggle: () => {
          saveState({ groupBy: value });
          draw();
        }
      })
    );
  }
  return group;
}

function filterBar(payload: RisksPayload): HTMLElement {
  return el('div', { class: 'filter-bar', role: 'group', 'aria-label': RISKS.filtersLabel }, [
    searchBox(),
    el('span', { class: 'dim' }, [RISKS.typeLabel]),
    typeChips(payload),
    el('span', { class: 'dim' }, [RISKS.statusLabel]),
    statusToggles(),
    showResolvedToggle(),
    el('span', { class: 'dim' }, [RISKS.groupByLabel]),
    groupByToggles()
  ]);
}

function sourceLine(group: RiskGroup, risk: RiskRow): HTMLElement {
  if (risk.sourceKind !== 'artifact' || risk.artifactRelPath === null) {
    return el('div', { class: 'risk-source' }, [
      format(RISKS.recordedIn, { source: '' }),
      el('code', {}, [risk.source])
    ]);
  }
  const relPath = risk.artifactRelPath;
  const link = el('button', { class: 'link', type: 'button' }, [relPath]);
  link.setAttribute('aria-label', format(RISKS.openArtifactLabel, { path: relPath }));
  link.addEventListener('click', () =>
    post({
      type: 'openArtifact',
      folderUri: group.folderUri,
      artifactRelPath: relPath,
      variant: 'md'
    })
  );
  return el('div', { class: 'risk-source' }, [format(RISKS.fromArtifact, { path: '' }), link]);
}

function riskRow(group: RiskGroup, risk: RiskRow): HTMLLIElement {
  const text = risk.resolved
    ? el('div', { class: 'risk-text' }, [
        el('s', {}, [risk.text]),
        ' ',
        chip({ text: RISKS.resolvedBadge, tone: 'neutral' })
      ])
    : el('div', { class: 'risk-text' }, [risk.text]);
  return el('li', { class: risk.resolved ? 'risk risk-resolved' : 'risk' }, [
    glyph(risk.resolved ? '✓' : '⚠'),
    el('div', {}, [text, sourceLine(group, risk)])
  ]);
}

function groupHeader(entry: VisibleGroup, list: HTMLElement, expanded: boolean): HTMLElement {
  const group = entry.group;
  const head = el('div', { class: 'risk-group-head' });

  const expander = el('button', { class: 'expander', type: 'button' }, [glyph(expanded ? '▾' : '▸')]);
  expander.setAttribute('aria-expanded', String(expanded));
  expander.setAttribute('aria-label', format(RISKS.groupLabel, { title: group.title }));
  expander.addEventListener('click', () => {
    const open = expander.getAttribute('aria-expanded') !== 'true';
    expander.setAttribute('aria-expanded', String(open));
    expander.replaceChildren(glyph(open ? '▾' : '▸'));
    list.hidden = !open;
    saveState({ collapsed: { ...state.collapsed, [entry.key]: !open } });
  });

  const title = el('button', { class: 'risk-group-title', type: 'button' }, [
    state.groupBy === 'task' ? group.title : entry.key
  ]);
  title.setAttribute('aria-label', format(RISKS.openTaskLabel, { title: group.title }));
  title.addEventListener('click', () => post({ type: 'openTask', folderUri: group.folderUri }));

  head.append(expander, title);
  if (state.groupBy === 'task') {
    head.append(
      chip({ text: group.typeLabel, tone: 'neutral' }),
      el('span', { class: 'dim' }, [
        [
          `${group.statusGlyph} ${group.statusText}`,
          group.verdict,
          group.activity,
          group.author
        ]
          .filter((part) => part !== null && part !== '')
          .join(' · ')
      ])
    );
  }

  const open = entry.risks.filter((risk) => !risk.resolved).length;
  head.append(
    el('span', { class: 'risk-count' }, [
      open === 1 ? RISKS.openCountOne : format(RISKS.openCount, { n: open })
    ])
  );

  if (state.groupBy === 'task' && group.nextAction !== null) {
    const action = group.nextAction;
    const button = el('button', { class: 'action action-small', type: 'button' }, [
      glyph('▶'),
      action.label
    ]);
    button.setAttribute(
      'aria-label',
      format(RISKS.nextActionLabel, { action: action.label, title: group.title })
    );
    button.addEventListener('click', () =>
      post({ type: 'runNextAction', folderUri: group.folderUri })
    );
    head.append(button);
  }
  return head;
}

function groupCard(entry: VisibleGroup, position: number): HTMLElement {
  const stored = state.collapsed[entry.key];
  const expanded = stored === undefined ? position < EXPANDED_BY_DEFAULT : !stored;
  const list = el('ul', { class: 'plain risks' });
  for (const risk of entry.risks) {
    list.append(riskRow(entry.group, risk));
  }
  list.hidden = !expanded;
  return el('section', { class: 'card risk-group' }, [
    groupHeader(entry, list, expanded),
    list
  ]);
}

function headingLine(groups: readonly VisibleGroup[]): string {
  const open = groups.reduce(
    (sum, entry) => sum + entry.risks.filter((risk) => !risk.resolved).length,
    0
  );
  const line = format(RISKS.summary, { open, k: groups.length });
  if (!state.showResolved) {
    return line;
  }
  const resolved = groups.reduce(
    (sum, entry) => sum + entry.risks.filter((risk) => risk.resolved).length,
    0
  );
  // The mockup's resolved clause belongs to the Show resolved state only (audit W7).
  return resolved === 0 ? line : `${line} · ${format(RISKS.resolvedClause, { n: resolved })}`;
}

export function render(payload: RisksPayload, root: HTMLElement): void {
  const groups = visibleGroups(payload);
  const fragment = document.createDocumentFragment();

  const crumb = el('button', { class: 'link', type: 'button' }, [RISKS.breadcrumb]);
  crumb.addEventListener('click', () => post({ type: 'openDashboard' }));
  fragment.append(el('nav', { 'aria-label': RISKS.breadcrumbLabel }, [crumb]));

  fragment.append(
    el('div', { class: 'head' }, [
      el('h1', {}, [RISKS.heading]),
      el('span', { class: 'dim' }, [headingLine(groups)]),
      payload.scopedTitle === null
        ? null
        : el('span', { class: 'dim' }, [format(RISKS.scopedTo, { title: payload.scopedTitle })])
    ])
  );

  const tiles = el('div', { class: 'kpis' });
  for (const value of payload.kpis) {
    tiles.append(kpi(value));
  }
  fragment.append(tiles, filterBar(payload), el('p', { class: 'dim' }, [RISKS.orderNote]));

  if (payload.groups.length === 0) {
    fragment.append(el('p', { class: 'empty' }, [RISKS.emptyIndex]));
  } else if (groups.length === 0) {
    fragment.append(el('p', { class: 'empty' }, [RISKS.empty]));
  } else {
    const list = el('div', { class: 'risk-groups' });
    groups.slice(0, GROUPS_SHOWN).forEach((entry, position) => {
      list.append(groupCard(entry, position));
    });
    fragment.append(list);
    if (groups.length > GROUPS_SHOWN) {
      fragment.append(
        el('p', { class: 'dim' }, [
          format(RISKS.showMore, { n: groups.length - GROUPS_SHOWN })
        ])
      );
    }
  }
  root.replaceChildren(fragment);
}

function draw(): void {
  const root = document.getElementById('root');
  if (root !== null && current !== null) {
    render(current, root);
  }
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'risks'
  ) {
    current = message as RisksPayload;
    draw();
  }
});

post({ type: 'ready' });
