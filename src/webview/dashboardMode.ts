import { DASHBOARD, format } from '../strings.ts';
import { el, glyph, kpi, type Tone } from './components.ts';

/**
 * § 5.5 — the portfolio view: four KPI tiles, four hand-written SVG charts that double as
 * filters, and the filtered task table. The host pre-aggregates every count over the whole
 * index and supplies the rows; this bundle owns the markup, the accessible names and the
 * table sort. Charts always show all tasks — only the table follows the shared `TaskQuery`.
 */

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

export interface DashboardKpi {
  readonly key: 'tasks' | 'failedVerification' | 'quiet' | 'openRisks';
  readonly glyph: string;
  readonly tone: Tone;
  readonly value: number;
  readonly label: string;
  readonly context: string;
}

export interface DashboardBar {
  readonly key: string;
  readonly label: string;
  readonly glyph: string;
  readonly count: number;
  readonly tone: Tone;
  /** A neutral value — drawn hatched, never as a flat colour that could read as a category. */
  readonly hatched: boolean;
  readonly pressed: boolean;
}

export interface DashboardWeek {
  readonly label: string;
  readonly count: number;
  readonly current: boolean;
}

export interface DashboardChart {
  readonly key: 'status' | 'verification' | 'type' | 'created';
  readonly title: string;
  readonly scope: string;
  /** The `TaskQuery` field a bar toggles; `null` for the week columns, which never filter. */
  readonly facet: 'statuses' | 'verdicts' | 'types' | null;
  readonly bars: readonly DashboardBar[];
  readonly weeks: readonly DashboardWeek[];
  readonly footnote: string | null;
}

export interface DashboardRow {
  readonly folderUri: string;
  readonly title: string;
  readonly typeLabel: string;
  readonly statusGlyph: string;
  readonly statusText: string;
  readonly verdict: string;
  readonly author: string;
  readonly created: string;
  readonly activity: string;
  readonly nextAction: { readonly id: string; readonly label: string } | null;
}

export interface DashboardFilterChip {
  readonly key: string;
  readonly label: string;
  /** The patch that removes this chip; the host validates it like any other (A2). */
  readonly patch: Record<string, unknown>;
}

export interface DashboardPayload {
  readonly type: 'dashboard';
  readonly heading: string;
  readonly scope: string;
  readonly kpis: readonly DashboardKpi[];
  readonly charts: readonly DashboardChart[];
  readonly rows: readonly DashboardRow[];
  readonly rowLimit: number;
  readonly matched: number;
  readonly total: number;
  readonly filter: { readonly chips: readonly DashboardFilterChip[]; readonly count: number };
}

type SortKey = 'title' | 'type' | 'status' | 'verdict' | 'author' | 'created' | 'activity';

interface LocalState {
  sortKey: SortKey;
  ascending: boolean;
}

const SORT_KEYS: readonly SortKey[] = [
  'title',
  'type',
  'status',
  'verdict',
  'author',
  'created',
  'activity'
];

const BAR_TRACK = 100;
const BAR_HEIGHT = 12;
const WEEK_WIDTH = 34;
const WEEK_GAP = 6;
const WEEK_PLOT_HEIGHT = 96;
const WEEK_BASELINE = 112;
const WEEK_LABEL_EVERY = 3;

const api = acquireVsCodeApi();

function post(message: unknown): void {
  api.postMessage(message);
}

function readState(): LocalState {
  const stored = api.getState();
  if (stored === null || typeof stored !== 'object') {
    return { sortKey: 'activity', ascending: false };
  }
  const candidate = stored as Partial<LocalState>;
  return {
    sortKey: SORT_KEYS.includes(candidate.sortKey as SortKey)
      ? (candidate.sortKey as SortKey)
      : 'activity',
    ascending: candidate.ascending === true
  };
}

let state = readState();
let current: DashboardPayload | null = null;

function saveState(patch: Partial<LocalState>): void {
  state = { ...state, ...patch };
  api.setState(state);
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  children: (Node | string)[] = []
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}

/** A hatch a neutral value is filled with, so "no category" never reads as a colour. */
function hatchPattern(id: string): SVGDefsElement {
  return svg('defs', {}, [
    svg(
      'pattern',
      {
        id,
        width: '4',
        height: '4',
        patternUnits: 'userSpaceOnUse',
        patternTransform: 'rotate(45)'
      },
      [svg('line', { x1: '0', y1: '0', x2: '0', y2: '4', class: 'hatch-line' })]
    )
  ]);
}

function barTrack(chartKey: string, bar: DashboardBar, widest: number): SVGSVGElement {
  const width = widest === 0 ? 0 : (bar.count / widest) * BAR_TRACK;
  const patternId = `hatch-${chartKey}-${bar.key}`;
  const rect = svg('rect', {
    x: '0',
    y: '0',
    height: String(BAR_HEIGHT),
    width: String(Math.max(width, bar.count > 0 ? 1 : 0)),
    class: `bar-fill tone-${bar.tone}`
  });
  if (bar.hatched) {
    rect.setAttribute('fill', `url(#${patternId})`);
  }
  return svg(
    'svg',
    {
      class: 'bar-track',
      viewBox: `0 0 ${BAR_TRACK} ${BAR_HEIGHT}`,
      preserveAspectRatio: 'none',
      'aria-hidden': 'true',
      focusable: 'false'
    },
    bar.hatched ? [hatchPattern(patternId), rect] : [rect]
  );
}

function barRows(chart: DashboardChart): HTMLElement {
  const widest = chart.bars.reduce((most, bar) => Math.max(most, bar.count), 0);
  const list = el('ul', { class: 'plain bars' });
  for (const bar of chart.bars) {
    const button = el('button', { class: 'bar-row', type: 'button' });
    button.setAttribute('aria-pressed', String(bar.pressed));
    button.setAttribute(
      'aria-label',
      format(DASHBOARD.barLabel, { label: bar.label, count: bar.count })
    );
    button.append(
      el('span', { class: 'bar-label' }, [glyph(bar.glyph), ` ${bar.label}`]),
      barTrack(chart.key, bar, widest),
      el('span', { class: 'bar-value' }, [String(bar.count)])
    );
    button.addEventListener('click', () => toggleBar(chart, bar));
    list.append(el('li', {}, [button]));
  }
  return list;
}

function toggleBar(chart: DashboardChart, bar: DashboardBar): void {
  if (chart.facet === null) {
    return;
  }
  const pressed = chart.bars.filter((candidate) => candidate.pressed).map((candidate) => candidate.key);
  const next = bar.pressed
    ? pressed.filter((key) => key !== bar.key)
    : [...pressed, bar.key];
  post({ type: 'setFilter', patch: { [chart.facet]: next } });
}

function weekColumns(chart: DashboardChart): SVGSVGElement {
  const tallest = chart.weeks.reduce((most, week) => Math.max(most, week.count), 0);
  const width = chart.weeks.length * (WEEK_WIDTH + WEEK_GAP);
  const detail = chart.weeks
    .map((week) => format(DASHBOARD.weekDetail, { label: week.label, count: week.count }))
    .join(', ');

  const figure = svg('svg', {
    class: 'weeks',
    viewBox: `0 0 ${width} 130`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': format(DASHBOARD.weekSummary, { detail })
  });
  figure.append(
    svg('line', {
      class: 'axis',
      x1: '0',
      x2: String(width),
      y1: String(WEEK_BASELINE),
      y2: String(WEEK_BASELINE)
    })
  );

  chart.weeks.forEach((week, position) => {
    const height = tallest === 0 ? 0 : Math.round((week.count / tallest) * WEEK_PLOT_HEIGHT);
    const x = position * (WEEK_WIDTH + WEEK_GAP);
    const column = svg(
      'rect',
      {
        class: week.current ? 'week-fill week-current' : 'week-fill',
        x: String(x),
        y: String(WEEK_BASELINE - height),
        width: String(WEEK_WIDTH),
        height: String(Math.max(height, week.count > 0 ? 1 : 0))
      },
      [
        svg('title', {}, [
          format(week.current ? DASHBOARD.weekCurrent : DASHBOARD.weekColumn, {
            label: week.label,
            count: week.count
          })
        ])
      ]
    );
    figure.append(column);
    if (position % WEEK_LABEL_EVERY === 0) {
      figure.append(
        svg(
          'text',
          {
            class: 'week-label',
            x: String(x + WEEK_WIDTH / 2),
            y: String(WEEK_BASELINE + 14),
            'text-anchor': 'middle'
          },
          [week.label]
        )
      );
    }
  });
  return figure;
}

/** The § 5.5 **Table** link: the same numbers as the chart, in a table a screen reader reads. */
function chartTable(chart: DashboardChart): HTMLElement {
  const table = el('table', { class: 'chart-table' });
  table.append(el('caption', {}, [chart.title]));
  table.append(
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col' }, [DASHBOARD.columnLabel]),
        el('th', { scope: 'col' }, [DASHBOARD.columnCount])
      ])
    ])
  );
  const body = el('tbody');
  const entries: readonly { label: string; count: number }[] =
    chart.bars.length > 0
      ? chart.bars.map((bar) => ({ label: bar.label, count: bar.count }))
      : chart.weeks.map((week) => ({ label: week.label, count: week.count }));
  for (const entry of entries) {
    body.append(
      el('tr', {}, [
        el('th', { scope: 'row' }, [entry.label]),
        el('td', {}, [String(entry.count)])
      ])
    );
  }
  table.append(body);
  return table;
}

function chartCard(chart: DashboardChart): HTMLElement {
  const headingId = `chart-${chart.key}`;
  const section = el('section', { class: 'card chart', 'aria-labelledby': headingId });
  const figure = el('div', { class: 'chart-body' });
  const toggle = el('button', { class: 'link', type: 'button' }, [DASHBOARD.tableLink]);
  toggle.setAttribute('aria-label', format(DASHBOARD.tableLinkLabel, { chart: chart.title }));

  let showingTable = false;
  const draw = (): void => {
    figure.replaceChildren(
      showingTable
        ? chartTable(chart)
        : chart.bars.length > 0
          ? barRows(chart)
          : weekColumns(chart)
    );
    toggle.replaceChildren(showingTable ? DASHBOARD.chartLink : DASHBOARD.tableLink);
    toggle.setAttribute(
      'aria-label',
      format(showingTable ? DASHBOARD.chartLinkLabel : DASHBOARD.tableLinkLabel, {
        chart: chart.title
      })
    );
  };
  toggle.addEventListener('click', () => {
    showingTable = !showingTable;
    draw();
  });
  draw();

  section.append(
    el('div', { class: 'chart-head' }, [
      el('h3', { id: headingId }, [chart.title]),
      toggle
    ]),
    el('p', { class: 'chart-scope' }, [chart.scope]),
    figure
  );
  if (chart.footnote !== null) {
    section.append(el('p', { class: 'chart-footnote' }, [chart.footnote]));
  }
  return section;
}

function filterBar(payload: DashboardPayload): HTMLElement {
  const bar = el('div', { class: 'filter-bar', role: 'group', 'aria-label': DASHBOARD.filtersGroup });
  bar.append(el('span', { class: 'dim' }, [DASHBOARD.filtersLabel]));
  for (const entry of payload.filter.chips) {
    const remove = el('button', { class: 'chip-remove', type: 'button' }, [glyph('✕')]);
    remove.setAttribute('aria-label', format(DASHBOARD.removeFilter, { label: entry.label }));
    remove.addEventListener('click', () => post({ type: 'setFilter', patch: entry.patch }));
    bar.append(el('span', { class: 'chip chip-neutral' }, [entry.label, remove]));
  }
  if (payload.filter.count > 0) {
    const clear = el('button', { class: 'link', type: 'button' }, [DASHBOARD.clearAll]);
    clear.addEventListener('click', () => post({ type: 'clearFilter' }));
    bar.append(clear);
  }
  bar.append(el('span', { class: 'dim filter-note' }, [DASHBOARD.chartsNote]));
  return bar;
}

function compare(left: DashboardRow, right: DashboardRow, key: SortKey): number {
  switch (key) {
    case 'title':
      return left.title.localeCompare(right.title);
    case 'type':
      return left.typeLabel.localeCompare(right.typeLabel);
    case 'status':
      return left.statusText.localeCompare(right.statusText);
    case 'verdict':
      return left.verdict.localeCompare(right.verdict);
    case 'author':
      return left.author.localeCompare(right.author);
    case 'created':
      return left.created.localeCompare(right.created);
    default:
      return 0;
  }
}

/** The host orders rows by activity already, so that column sorts by the incoming order. */
function sortedRows(payload: DashboardPayload): DashboardRow[] {
  const rows = [...payload.rows];
  if (state.sortKey !== 'activity') {
    rows.sort((left, right) => compare(left, right, state.sortKey));
  }
  return state.ascending === (state.sortKey === 'activity') ? rows.reverse() : rows;
}

function headerCell(key: SortKey, label: string): HTMLTableCellElement {
  const cell = el('th', { scope: 'col' });
  const active = state.sortKey === key;
  cell.setAttribute('aria-sort', active ? (state.ascending ? 'ascending' : 'descending') : 'none');
  const button = el('button', { class: 'sort-header', type: 'button' }, [label]);
  button.setAttribute('aria-label', format(DASHBOARD.sortLabel, { column: label }));
  if (active) {
    button.append(glyph(state.ascending ? '▴' : '▾'));
  }
  button.addEventListener('click', () => {
    saveState(active ? { ascending: !state.ascending } : { sortKey: key, ascending: false });
    draw();
  });
  cell.append(button);
  return cell;
}

function taskRow(row: DashboardRow): HTMLTableRowElement {
  const open = el('button', { class: 'link', type: 'button' }, [row.title]);
  open.setAttribute('aria-label', format(DASHBOARD.openTaskLabel, { title: row.title }));
  open.addEventListener('click', () => post({ type: 'openTask', folderUri: row.folderUri }));

  const next = el('td', {});
  if (row.nextAction !== null) {
    const action = row.nextAction;
    const button = el('button', { class: 'action action-small', type: 'button' }, [
      glyph('▶'),
      action.label
    ]);
    button.setAttribute(
      'aria-label',
      format(DASHBOARD.nextActionLabel, { action: action.label, title: row.title })
    );
    button.addEventListener('click', () => post({ type: 'runNextAction', folderUri: row.folderUri }));
    next.append(button);
  }

  return el('tr', {}, [
    el('td', {}, [open]),
    el('td', {}, [row.typeLabel]),
    el('td', {}, [glyph(row.statusGlyph), ` ${row.statusText}`]),
    el('td', {}, [row.verdict]),
    el('td', {}, [row.author]),
    el('td', {}, [row.created]),
    el('td', {}, [row.activity]),
    next
  ]);
}

function taskTable(payload: DashboardPayload): HTMLElement {
  if (payload.rows.length === 0) {
    return el('p', { class: 'empty' }, [DASHBOARD.empty]);
  }
  const table = el('table', { class: 'task-table' });
  table.append(
    el('thead', {}, [
      el('tr', {}, [
        headerCell('title', DASHBOARD.columns.title),
        headerCell('type', DASHBOARD.columns.type),
        headerCell('status', DASHBOARD.columns.status),
        headerCell('verdict', DASHBOARD.columns.verdict),
        headerCell('author', DASHBOARD.columns.author),
        headerCell('created', DASHBOARD.columns.created),
        headerCell('activity', DASHBOARD.columns.activity),
        el('th', { scope: 'col' }, [DASHBOARD.columns.next])
      ])
    ])
  );
  const body = el('tbody');
  for (const row of sortedRows(payload)) {
    body.append(taskRow(row));
  }
  table.append(body);
  return table;
}

export function render(payload: DashboardPayload, root: HTMLElement): void {
  const fragment = document.createDocumentFragment();
  fragment.append(
    el('div', { class: 'head' }, [
      el('h1', {}, [payload.heading]),
      el('span', { class: 'dim' }, [payload.scope])
    ])
  );

  const tiles = el('div', { class: 'kpis' });
  for (const tile of payload.kpis) {
    tiles.append(
      kpi(
        tile.key === 'openRisks'
          ? {
              ...tile,
              onActivate: () => post({ type: 'openRisks' }),
              actionLabel: format(DASHBOARD.openRisksLabel, { k: tile.value })
            }
          : tile
      )
    );
  }
  fragment.append(tiles, filterBar(payload));

  const grid = el('div', { class: 'chart-grid' });
  for (const chart of payload.charts) {
    grid.append(chartCard(chart));
  }
  fragment.append(grid);

  fragment.append(
    el('h2', {}, [
      DASHBOARD.tasksHeading,
      el('span', { class: 'dim' }, [
        ` ${format(DASHBOARD.tasksCount, { matched: payload.matched, total: payload.total })}`
      ])
    ]),
    taskTable(payload)
  );
  if (payload.matched > payload.rowLimit) {
    fragment.append(
      el('p', { class: 'dim' }, [format(DASHBOARD.tasksCapped, { limit: payload.rowLimit })])
    );
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
    (message as { type?: unknown }).type === 'dashboard'
  ) {
    current = message as DashboardPayload;
    draw();
  }
});

post({ type: 'ready' });
