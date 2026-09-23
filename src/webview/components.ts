/**
 * The primitives every Maister Lens webview surface is built from: a toggle tile, a chip,
 * a task row and a summary card. They own the markup and the accessible names; the bundles
 * supply data and handlers. Styling lives entirely in `media/webview.css`, which uses
 * VS Code theme variables as its only design tokens.
 */

type Child = Node | string | null | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  children: Child[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  for (const child of children) {
    if (child === null || child === undefined) {
      continue;
    }
    node.append(child);
  }
  return node;
}

/** Text only a screen reader reads — the counterpart of every glyph, so colour and shape are never alone. */
export function hidden(text: string): HTMLSpanElement {
  return el('span', { class: 'sr-only' }, [text]);
}

export function glyph(text: string): HTMLSpanElement {
  return el('span', { class: 'glyph', 'aria-hidden': 'true' }, [text]);
}

export interface TileOptions {
  readonly label: string;
  readonly count?: number;
  readonly glyph?: string;
  readonly pressed: boolean;
  readonly onToggle: () => void;
}

/** A filter facet: a toggle button whose pressed state is carried by `aria-pressed` and a ✓. */
export function tile(options: TileOptions): HTMLButtonElement {
  const button = el('button', { class: 'tile', type: 'button' });
  button.setAttribute('aria-pressed', String(options.pressed));
  if (options.pressed) {
    button.append(glyph('✓'));
  }
  if (options.glyph !== undefined) {
    button.append(glyph(options.glyph));
  }
  button.append(document.createTextNode(` ${options.label} `));
  if (options.count !== undefined) {
    button.append(el('b', { class: 'tile-count' }, [String(options.count)]));
  }
  button.addEventListener('click', options.onToggle);
  return button;
}

/** The tones Dashboard and Risks colour with; each resolves to a `--vscode-charts-*` variable. */
export type Tone = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'neutral';

export interface KpiOptions {
  readonly glyph: string;
  readonly tone: Tone;
  readonly value: number;
  readonly label: string;
  readonly context: string;
  /** When present the tile becomes a button; its accessible name is `actionLabel`. */
  readonly onActivate?: () => void;
  readonly actionLabel?: string;
}

/**
 * A § 5.5 KPI tile: a glyph on a coloured disc, a value, a label and a one-line context.
 * The glyph, the label and the context carry the meaning; the disc only repeats it.
 */
export function kpi(options: KpiOptions): HTMLElement {
  const body = [
    el('span', { class: `kpi-disc tone-${options.tone}` }, [glyph(options.glyph)]),
    el('span', { class: 'kpi-body' }, [
      el('span', { class: 'kpi-value' }, [String(options.value)]),
      el('span', { class: 'kpi-label' }, [options.label]),
      el('span', { class: 'kpi-context' }, [options.context])
    ])
  ];
  if (options.onActivate === undefined) {
    return el('div', { class: 'kpi' }, body);
  }
  const button = el('button', { class: 'kpi kpi-action', type: 'button' }, body);
  if (options.actionLabel !== undefined) {
    button.setAttribute('aria-label', options.actionLabel);
  }
  button.addEventListener('click', options.onActivate);
  return button;
}

export interface ChipOptions {
  readonly text: string;
  readonly glyph?: string;
  readonly hiddenText?: string;
  readonly tone?: 'warn' | 'error' | 'neutral';
}

export function chip(options: ChipOptions): HTMLSpanElement {
  const tone = options.tone ?? 'neutral';
  return el('span', { class: `chip chip-${tone}` }, [
    options.glyph === undefined ? null : glyph(options.glyph),
    options.text === '' ? null : document.createTextNode(options.text),
    options.hiddenText === undefined ? null : hidden(options.hiddenText)
  ]);
}

export interface RowAction {
  readonly label: string;
  readonly glyph: string;
  readonly onActivate: () => void;
}

export interface RowOptions {
  readonly title: string;
  readonly statusGlyph: string;
  readonly statusText: string;
  readonly description: string;
  readonly markers: readonly ChipOptions[];
  readonly action?: RowAction;
  readonly onOpen: () => void;
  readonly expander?: { readonly label: string; readonly build: () => HTMLElement };
}

/**
 * One task line: status glyph and word, a title button that opens the task, the description,
 * the markers, and — always a separate control — the next action.
 */
export function row(options: RowOptions): HTMLLIElement {
  const item = el('li', { class: 'trow' });
  const line = el('div', { class: 'trow-line' });

  line.append(glyph(options.statusGlyph));

  if (options.expander !== undefined) {
    const expander = el('button', { class: 'expander', type: 'button' });
    expander.setAttribute('aria-expanded', 'false');
    expander.setAttribute('aria-label', options.expander.label);
    expander.append(glyph('▸'));
    let body: HTMLElement | null = null;
    expander.addEventListener('click', () => {
      const open = expander.getAttribute('aria-expanded') === 'true';
      expander.setAttribute('aria-expanded', String(!open));
      expander.replaceChildren(glyph(open ? '▸' : '▾'));
      if (open) {
        body?.remove();
        body = null;
        return;
      }
      body = options.expander?.build() ?? null;
      if (body !== null) {
        item.append(body);
      }
    });
    line.append(expander);
  }

  const title = el('button', { class: 'trow-title', type: 'button' }, [options.title]);
  title.addEventListener('click', options.onOpen);
  line.append(title);

  line.append(
    el('span', { class: 'trow-description' }, [options.description, hidden(options.statusText)])
  );

  for (const marker of options.markers) {
    line.append(chip(marker));
  }

  if (options.action !== undefined) {
    const action = el('button', { class: 'row-action', type: 'button' });
    action.setAttribute('aria-label', options.action.label);
    action.title = options.action.label;
    action.append(glyph(options.action.glyph));
    action.addEventListener('click', options.action.onActivate);
    line.append(action);
  }

  item.append(line);
  return item;
}

export interface SummaryCardOptions {
  readonly label: string;
  readonly value: string;
  /** Live regions announce their own updates; a static caption does not. */
  readonly live?: boolean;
}

export function summaryCard(options: SummaryCardOptions): HTMLElement {
  const card = el('div', { class: 'summary-card' }, [
    el('span', { class: 'summary-label' }, [options.label]),
    el('span', { class: 'summary-value' }, [options.value])
  ]);
  if (options.live === true) {
    card.setAttribute('role', 'status');
  }
  return card;
}
