import { FALLBACK, PANEL, format } from '../strings.ts';
import { chip, el, glyph } from './components.ts';

/**
 * § 5.4 — the native task summary, shown whenever Maister's own dashboard is not hosted.
 * The host builds every value; this bundle owns only the markup, the section order and the
 * accessible names. The banner and the A2.2 button rule are decided host-side.
 */

declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

export interface FallbackPhase {
  readonly id: string;
  readonly name: string;
  readonly glyph: string;
  readonly statusText: string;
}

export interface FallbackHero {
  readonly artifactRelPath: string;
  readonly label: string;
  readonly tldr: string | null;
  readonly variant: 'md' | 'html';
}

export interface FallbackDecisionGroup {
  readonly source: string;
  readonly items: readonly { readonly text: string; readonly rationale: string | null }[];
}

export interface FallbackRisk {
  readonly text: string;
  readonly resolved: boolean;
  readonly source: string;
}

export interface FallbackFile {
  readonly artifactRelPath: string;
  readonly label: string;
  /** The folder path, shown dimmed beside a registered artifact's label. */
  readonly folder: string;
  readonly variant: 'md' | 'html';
}

export interface FallbackPayload {
  readonly type: 'task';
  readonly folderUri: string;
  readonly banner: string;
  /** A2.2 — false in an untrusted workspace, and the button is then not rendered at all. */
  readonly openInBrowser: boolean;
  readonly dashboardRelPath: string;
  readonly title: string;
  readonly typeLabel: string;
  readonly statusGlyph: string;
  readonly statusText: string;
  readonly verdict: string;
  readonly author: string;
  readonly created: string;
  readonly updated: string;
  readonly parseIssues: readonly string[];
  /** null in an untrusted workspace or when § 7.2 derives no action. */
  readonly nextAction: { readonly id: string; readonly label: string } | null;
  readonly phases: readonly FallbackPhase[];
  readonly heroes: readonly FallbackHero[];
  readonly decisions: readonly FallbackDecisionGroup[];
  readonly risks: readonly FallbackRisk[];
  readonly files: readonly FallbackFile[];
  readonly rawState: string;
}

const RAW_STATE_ID = 'raw-state';

const api = acquireVsCodeApi();

function post(message: unknown): void {
  api.postMessage(message);
}

function section(label: string, id?: string): HTMLHeadingElement {
  return el('h2', id === undefined ? {} : { id }, [label]);
}

/** The Risks heading opens the Follow-ups view scoped to this task. */
function risksSection(payload: FallbackPayload): HTMLHeadingElement {
  const open = el('button', { class: 'link', type: 'button' }, [FALLBACK.risksLabel]);
  open.setAttribute('aria-label', format(FALLBACK.openFollowUpsLabel, { title: payload.title }));
  open.addEventListener('click', () =>
    post({ type: 'openFollowUps', folderUri: payload.folderUri })
  );
  return el('h2', {}, [open]);
}

function actionButton(label: string, onActivate: () => void): HTMLButtonElement {
  const button = el('button', { class: 'action', type: 'button' }, [label]);
  button.addEventListener('click', onActivate);
  return button;
}

function banner(payload: FallbackPayload): HTMLElement {
  const note = el('p', { class: 'banner', role: 'note' }, [glyph('ⓘ'), payload.banner]);
  if (payload.openInBrowser) {
    note.append(
      actionButton(PANEL.openInBrowser, () =>
        post({
          type: 'openInBrowser',
          folderUri: payload.folderUri,
          artifactRelPath: payload.dashboardRelPath
        })
      )
    );
  }
  return note;
}

function header(payload: FallbackPayload): HTMLElement {
  const head = el('div', { class: 'fb-head' });
  head.append(el('h1', { class: 'fb-title' }, [payload.title]));
  if (payload.nextAction !== null) {
    const action = payload.nextAction;
    head.append(
      actionButton(`▶ ${action.label}`, () =>
        post({ type: 'runNextAction', folderUri: payload.folderUri })
      )
    );
  }

  const meta = el('p', { class: 'fb-meta' });
  meta.append(chip({ text: payload.typeLabel, tone: 'neutral' }));
  // The mockup draws `Status: ◯ In progress`, so the label comes from the same string with an
  // empty value and the glyph sits between it and the word that carries the meaning.
  meta.append(
    el('span', {}, [
      format(FALLBACK.status, { status: '' }),
      glyph(payload.statusGlyph),
      ` ${payload.statusText}`
    ])
  );
  meta.append(el('span', {}, [format(FALLBACK.author, { author: payload.author })]));
  meta.append(el('span', {}, [format(FALLBACK.verdict, { verdict: payload.verdict })]));
  meta.append(
    el('span', {}, [
      format(FALLBACK.dates, { created: payload.created, updated: payload.updated })
    ])
  );
  if (payload.parseIssues.length > 0) {
    meta.append(
      el('a', { href: `#${RAW_STATE_ID}` }, [
        payload.parseIssues.length === 1
          ? FALLBACK.parseIssuesOne
          : format(FALLBACK.parseIssues, { count: payload.parseIssues.length })
      ])
    );
  }

  const wrapper = el('div', {});
  wrapper.append(head, meta);
  return wrapper;
}

function phases(payload: FallbackPayload): HTMLElement {
  const list = el('ol', { class: 'plain fb-phases', 'aria-label': FALLBACK.phasesLabel });
  payload.phases.forEach((phase, index) => {
    list.append(
      el('li', {}, [
        glyph(phase.glyph),
        el('span', { class: 'fb-phase-name' }, [
          format(FALLBACK.phaseLine, { position: index + 1, name: phase.name })
        ]),
        el('span', { class: 'dim' }, [phase.statusText])
      ])
    );
  });
  return list;
}

function heroes(payload: FallbackPayload): HTMLElement {
  if (payload.heroes.length === 0) {
    return el('p', { class: 'empty' }, [FALLBACK.noHeroes]);
  }
  const grid = el('div', { class: 'fb-cards' });
  for (const hero of payload.heroes) {
    const card = el('div', { class: 'fb-card' }, [el('h3', {}, [hero.label])]);
    if (hero.tldr !== null) {
      card.append(el('p', { class: 'fb-card-text' }, [hero.tldr]));
    }
    const open = actionButton(FALLBACK.heroOpen, () =>
      post({
        type: 'openArtifact',
        folderUri: payload.folderUri,
        artifactRelPath: hero.artifactRelPath,
        variant: hero.variant
      })
    );
    open.setAttribute('aria-label', format(FALLBACK.heroOpenLabel, { label: hero.label }));
    card.append(open);
    grid.append(card);
  }
  return grid;
}

function decisions(payload: FallbackPayload): HTMLElement {
  if (payload.decisions.length === 0) {
    return el('p', { class: 'empty' }, [FALLBACK.noDecisions]);
  }
  const wrapper = el('div', {});
  for (const group of payload.decisions) {
    wrapper.append(el('h3', {}, [group.source]));
    const list = el('ul', { class: 'fb-list' });
    for (const item of group.items) {
      list.append(
        el('li', {}, [
          item.text,
          item.rationale === null
            ? null
            : el('span', { class: 'dim' }, [` — ${item.rationale}`])
        ])
      );
    }
    wrapper.append(list);
  }
  return wrapper;
}

function risks(payload: FallbackPayload): HTMLElement {
  if (payload.risks.length === 0) {
    return el('p', { class: 'empty' }, [FALLBACK.noRisks]);
  }
  const list = el('ul', { class: 'fb-list' });
  for (const risk of payload.risks) {
    list.append(
      risk.resolved
        ? el('li', { class: 'dim' }, [
            el('s', {}, [risk.text]),
            ' ',
            chip({ text: FALLBACK.riskResolved, tone: 'neutral' })
          ])
        : el('li', {}, [chip({ text: FALLBACK.riskOpen, glyph: '⚠', tone: 'warn' }), ` ${risk.text}`])
    );
  }
  return list;
}

function files(payload: FallbackPayload): HTMLElement {
  if (payload.files.length === 0) {
    return el('p', { class: 'empty' }, [FALLBACK.noArtifacts]);
  }
  const list = el('ul', { class: 'plain fb-files' });
  for (const file of payload.files) {
    const link = el('button', { class: 'link', type: 'button' }, [file.label]);
    link.addEventListener('click', () =>
      post({
        type: 'openArtifact',
        folderUri: payload.folderUri,
        artifactRelPath: file.artifactRelPath,
        variant: file.variant
      })
    );
    list.append(
      el('li', {}, [
        link,
        file.folder === '' ? null : el('span', { class: 'dim' }, [` ${file.folder}`])
      ])
    );
  }
  return list;
}

function rawState(payload: FallbackPayload): HTMLElement {
  const details = el('details', {});
  const count = payload.parseIssues.length;
  details.append(
    el('summary', {}, [
      count === 0
        ? FALLBACK.rawStateSummaryNone
        : count === 1
          ? FALLBACK.rawStateSummaryOne
          : format(FALLBACK.rawStateSummary, { count })
    ])
  );
  if (count > 0) {
    const issues = el('ul', { class: 'fb-list' });
    for (const issue of payload.parseIssues) {
      issues.append(el('li', {}, [issue]));
    }
    details.append(issues);
  }
  details.append(el('pre', { class: 'fb-raw' }, [payload.rawState]));
  details.append(
    actionButton(FALLBACK.openStateFile, () =>
      post({ type: 'openSource', folderUri: payload.folderUri })
    )
  );
  return details;
}

export function render(payload: FallbackPayload, root: HTMLElement): void {
  const fragment = document.createDocumentFragment();

  const crumb = el('button', { class: 'link', type: 'button' }, [FALLBACK.breadcrumb]);
  crumb.addEventListener('click', () => post({ type: 'openDashboard' }));
  fragment.append(el('nav', { 'aria-label': FALLBACK.breadcrumbLabel }, [crumb]));

  fragment.append(banner(payload));
  fragment.append(header(payload));
  fragment.append(section(FALLBACK.phasesLabel), phases(payload));
  fragment.append(section(FALLBACK.heroesLabel), heroes(payload));
  fragment.append(section(FALLBACK.decisionsLabel), decisions(payload));
  fragment.append(risksSection(payload), risks(payload));
  fragment.append(section(FALLBACK.artifactsLabel), files(payload));
  fragment.append(section(FALLBACK.rawStateLabel, RAW_STATE_ID), rawState(payload));
  root.replaceChildren(fragment);
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'task'
  ) {
    const root = document.getElementById('root');
    if (root !== null) {
      render(message as FallbackPayload, root);
    }
  }
});

post({ type: 'ready' });
