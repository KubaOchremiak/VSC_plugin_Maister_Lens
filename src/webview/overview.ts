import { NOW, OVERVIEW, format } from '../strings.ts';
import { el, row, summaryCard, tile } from './components.ts';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

/** The § 4.2 payload the host posts. Row fields only — never a `Task`. */
export interface OverviewFacet {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly pressed: boolean;
  readonly glyph?: string;
}

export interface OverviewMarker {
  readonly text: string;
  readonly glyph: string;
  readonly hiddenText: string;
  readonly tone: 'warn' | 'error';
}

export interface OverviewHero {
  readonly relPath: string;
  readonly label: string;
  readonly variant: 'md' | 'html';
}

export interface OverviewRow {
  readonly folderUri: string;
  readonly title: string;
  readonly statusGlyph: string;
  readonly statusText: string;
  readonly description: string;
  readonly markers: readonly OverviewMarker[];
  readonly nextAction: { readonly id: string; readonly label: string } | null;
  readonly heroes: readonly OverviewHero[];
}

export interface OverviewGroup {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly rows: readonly OverviewRow[];
  readonly truncated: boolean;
}

export interface OverviewStats {
  readonly status: readonly OverviewFacet[];
  readonly type: readonly OverviewFacet[];
  readonly attention: readonly OverviewFacet[];
  readonly total: number;
  readonly matched: number;
  readonly filterCount: number;
  readonly attributionEnabled: boolean;
  readonly mine: boolean;
  readonly quietDays: number;
}

export interface OverviewPayload {
  readonly type: 'overview';
  readonly stats: OverviewStats;
  readonly groups: readonly OverviewGroup[];
  readonly activeFilter: { readonly text: string };
  readonly groupBy: 'type' | 'status' | 'author' | 'month';
  readonly freshness: 'cached' | 'fresh';
}

interface LocalState {
  search: string;
  collapsed: Record<string, boolean>;
}

const SEARCH_DEBOUNCE_MS = 200;

const api = acquireVsCodeApi();

function readState(): LocalState {
  const stored = api.getState();
  if (stored === null || typeof stored !== 'object') {
    return { search: '', collapsed: {} };
  }
  const candidate = stored as Partial<LocalState>;
  return {
    search: typeof candidate.search === 'string' ? candidate.search : '',
    collapsed: typeof candidate.collapsed === 'object' && candidate.collapsed !== null ? candidate.collapsed : {}
  };
}

let state = readState();

function saveState(patch: Partial<LocalState>): void {
  state = { ...state, ...patch };
  api.setState(state);
}

function post(message: unknown): void {
  api.postMessage(message);
}

function pressedKeys(facets: readonly OverviewFacet[]): string[] {
  return facets.filter((facet) => facet.pressed).map((facet) => facet.key);
}

function toggled(keys: readonly string[], key: string): string[] {
  return keys.includes(key) ? keys.filter((candidate) => candidate !== key) : [...keys, key];
}

function searchBox(payload: OverviewPayload): HTMLElement {
  const input = el('input', {
    id: 'overview-search',
    class: 'search',
    type: 'search',
    placeholder: OVERVIEW.searchPlaceholder,
    'aria-label': OVERVIEW.searchAccessibleLabel
  });
  input.value = state.search !== '' ? state.search : payload.activeFilter.text;

  let timer: number | undefined;
  input.addEventListener('input', () => {
    saveState({ search: input.value });
    window.clearTimeout(timer);
    timer = window.setTimeout(() => post({ type: 'setFilter', patch: { text: input.value } }), SEARCH_DEBOUNCE_MS);
  });
  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') {
      return;
    }
    input.value = '';
    saveState({ search: '' });
    window.clearTimeout(timer);
    post({ type: 'setFilter', patch: { text: '' } });
  });

  return el('div', { class: 'field' }, [
    el('label', { class: 'field-label', for: 'overview-search' }, [OVERVIEW.searchLabel]),
    input
  ]);
}

function scopeToggle(stats: OverviewStats): HTMLElement | null {
  if (!stats.attributionEnabled) {
    return null;
  }
  const group = el('div', { class: 'scope', role: 'group', 'aria-label': OVERVIEW.scopeLabel });
  group.append(
    tile({
      label: OVERVIEW.scopeMine,
      pressed: stats.mine,
      onToggle: () => post({ type: 'setFilter', patch: { author: stats.mine ? null : 'me' } })
    }),
    tile({
      label: OVERVIEW.scopeEveryone,
      pressed: !stats.mine,
      onToggle: () => post({ type: 'setFilter', patch: { author: null } })
    })
  );
  return group;
}

function facetRow(label: string, facets: readonly OverviewFacet[], onToggle: (key: string) => void): HTMLElement | null {
  if (facets.length === 0) {
    return null;
  }
  const section = el('div', { class: 'facets' }, [el('div', { class: 'field-label' }, [label])]);
  const list = el('div', { class: 'tiles', role: 'group', 'aria-label': label });
  for (const facet of facets) {
    list.append(
      tile({
        label: facet.label,
        count: facet.count,
        glyph: facet.glyph,
        pressed: facet.pressed,
        onToggle: () => onToggle(facet.key)
      })
    );
  }
  section.append(list);
  return section;
}

function attentionPatch(stats: OverviewStats, key: string): Record<string, unknown> {
  const facet = stats.attention.find((candidate) => candidate.key === key);
  const pressed = facet?.pressed === true;
  if (key === 'failedVerification') {
    return { verdicts: pressed ? [] : ['failed'] };
  }
  return { quietAtLeastDays: pressed ? null : stats.quietDays };
}

function headingText(stats: OverviewStats): string {
  if (stats.filterCount === 0) {
    return OVERVIEW.recentlyActive;
  }
  const counts = format(OVERVIEW.tasksCount, { matched: stats.matched, total: stats.total });
  const filters =
    stats.filterCount === 1
      ? OVERVIEW.filterCountOne
      : format(OVERVIEW.filterCount, { count: stats.filterCount });
  return `${counts} · ${filters}`;
}

function heroList(task: OverviewRow): HTMLElement {
  const list = el('ul', { class: 'heroes plain' });
  for (const hero of task.heroes) {
    const button = el('button', { class: 'hero', type: 'button' }, [hero.label]);
    button.addEventListener('click', () =>
      post({
        type: 'openArtifact',
        folderUri: task.folderUri,
        artifactRelPath: hero.relPath,
        variant: hero.variant
      })
    );
    list.append(el('li', {}, [button]));
  }
  return list;
}

function taskRow(task: OverviewRow): HTMLLIElement {
  return row({
    title: task.title,
    statusGlyph: task.statusGlyph,
    statusText: task.statusText,
    description: task.description,
    markers: task.markers.map((marker) => ({
      text: marker.text,
      glyph: marker.glyph,
      hiddenText: marker.hiddenText,
      tone: marker.tone
    })),
    action:
      task.nextAction === null
        ? undefined
        : {
            label: format(NOW.accessibleNextAction, {
              action: task.nextAction.label,
              title: task.title
            }),
            glyph: '▶',
            onActivate: () => post({ type: 'runNextAction', folderUri: task.folderUri })
          },
    onOpen: () => post({ type: 'openTask', folderUri: task.folderUri }),
    expander:
      task.heroes.length === 0
        ? undefined
        : {
            label: format(OVERVIEW.heroesExpander, { title: task.title }),
            build: () => heroList(task)
          }
  });
}

/** Up/Down move focus between the rows of one group (§ 4.3). */
function rovingFocus(list: HTMLUListElement): void {
  list.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    const titles = Array.from(list.querySelectorAll<HTMLButtonElement>('.trow-title'));
    const at = titles.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) {
      return;
    }
    const next = titles[at + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next !== undefined) {
      event.preventDefault();
      next.focus();
    }
  });
}

function groupSection(group: OverviewGroup): HTMLElement {
  const headingId = `group-${group.key}`;
  const section = el('section', { class: 'group', 'aria-labelledby': headingId });
  const button = el('button', { class: 'group-header', type: 'button' });
  const open = state.collapsed[group.key] !== true && group.count > 0;
  button.setAttribute('aria-expanded', String(open));
  button.append(
    document.createTextNode(format(OVERVIEW.groupHeader, { group: group.label, count: group.count }))
  );

  const list = el('ul', { class: 'rows plain' });
  for (const task of group.rows) {
    list.append(taskRow(task));
  }
  rovingFocus(list);
  list.hidden = !open;

  button.addEventListener('click', () => {
    const nowOpen = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(nowOpen));
    list.hidden = !nowOpen;
    saveState({ collapsed: { ...state.collapsed, [group.key]: !nowOpen } });
  });

  section.append(el('h3', { class: 'group-heading', id: headingId }, [button]), list);

  if (group.truncated) {
    const showAll = el('button', { class: 'link', type: 'button' }, [OVERVIEW.showAllInDashboard]);
    showAll.addEventListener('click', () => post({ type: 'openDashboard' }));
    section.append(showAll);
  }
  return section;
}

function emptyState(stats: OverviewStats): HTMLElement {
  const filtered = stats.filterCount > 0 || stats.total > 0;
  const message = filtered ? OVERVIEW.emptyFiltered : OVERVIEW.emptyIndex;
  const action = el('button', { class: 'action', type: 'button' }, [
    filtered ? OVERVIEW.clearFilters : OVERVIEW.startWorkflow
  ]);
  action.addEventListener('click', () => post({ type: filtered ? 'clearFilter' : 'startWorkflow' }));
  return el('div', { class: 'empty' }, [el('p', {}, [message]), action]);
}

function render(payload: OverviewPayload): void {
  const root = document.getElementById('root');
  if (root === null) {
    return;
  }
  const stats = payload.stats;
  const fragment = document.createDocumentFragment();

  fragment.append(searchBox(payload));
  const scope = scopeToggle(stats);
  if (scope !== null) {
    fragment.append(scope);
  }

  const statusRow = facetRow(OVERVIEW.statusLabel, stats.status, (key) =>
    post({ type: 'setFilter', patch: { statuses: toggled(pressedKeys(stats.status), key) } })
  );
  const typeRow = facetRow(OVERVIEW.typeLabel, stats.type, (key) =>
    post({ type: 'setFilter', patch: { types: toggled(pressedKeys(stats.type), key) } })
  );
  const attentionRow = facetRow(OVERVIEW.attentionLabel, stats.attention, (key) =>
    post({ type: 'setFilter', patch: attentionPatch(stats, key) })
  );
  for (const section of [statusRow, typeRow, attentionRow]) {
    if (section !== null) {
      fragment.append(section);
    }
  }

  const list = el('div', { class: 'list' });
  list.append(summaryCard({ label: OVERVIEW.tasksLabel, value: headingText(stats) }));
  if (payload.freshness === 'cached') {
    list.append(summaryCard({ label: '', value: OVERVIEW.updating, live: true }));
  }

  const populated = payload.groups.some((group) => group.count > 0);
  if (!populated) {
    list.append(emptyState(stats));
  } else {
    for (const group of payload.groups) {
      list.append(groupSection(group));
    }
    const showAll = el('button', { class: 'link', type: 'button' }, [OVERVIEW.showAllInDashboard]);
    showAll.addEventListener('click', () => post({ type: 'openDashboard' }));
    list.append(showAll);
  }

  fragment.append(list);
  root.replaceChildren(fragment);
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'overview') {
    render(message as OverviewPayload);
  }
});

post({ type: 'ready' });
