import type { RenderPayload, ReaderLocation } from '../panel/render.ts';
import { READER, format } from '../strings.ts';
import { el } from './components.ts';

/**
 * § 6.3 — the artifact reader. `bodyHtml` arrives finished from `panel/render.ts`; this
 * bundle adds the breadcrumb, the hero chips, the pinned summary card and the one delegated
 * click handler that turns the rewritten links into A2 messages.
 */

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface ScrollState {
  readonly key: string;
  readonly scrollY: number;
}

const DOC_ID = 'doc';

const api = acquireVsCodeApi();
let current: ReaderLocation | null = null;

function post(message: unknown): void {
  api.postMessage(message);
}

function locationKey(location: ReaderLocation): string {
  return `${location.folderUri}\u0000${location.artifactRelPath}\u0000${location.variant}`;
}

function storedScroll(): ScrollState | null {
  const state = api.getState();
  return typeof state === 'object' &&
    state !== null &&
    typeof (state as ScrollState).key === 'string'
    ? (state as ScrollState)
    : null;
}

function skipLink(): HTMLAnchorElement {
  return el('a', { class: 'skip-link', href: `#${DOC_ID}` }, [READER.skipToDocument]);
}

function breadcrumb(payload: RenderPayload): HTMLElement {
  const nav = el('nav', { class: 'rd-crumbs', 'aria-label': READER.breadcrumbLabel });
  const back = el('button', { class: 'link', type: 'button' }, [
    format(READER.breadcrumbTask, { title: payload.taskTitle })
  ]);
  back.addEventListener('click', () =>
    post({ type: 'openTask', folderUri: payload.folderUri })
  );
  nav.append(back, el('span', { class: 'dim' }, [' › ']), el('span', {}, [payload.artifactLabel]));
  return nav;
}

function heroChips(payload: RenderPayload): HTMLElement | null {
  if (payload.heroes.length === 0) {
    return null;
  }
  const group = el('div', { class: 'rd-chips', role: 'group', 'aria-label': READER.heroesLabel });
  for (const hero of payload.heroes) {
    const button = el('button', { class: 'tile', type: 'button' }, [hero.label]);
    button.setAttribute('aria-pressed', String(hero.current));
    button.addEventListener('click', () =>
      post({
        type: 'openArtifact',
        folderUri: payload.folderUri,
        artifactRelPath: hero.artifactRelPath,
        variant: 'md'
      })
    );
    group.append(button);
  }
  return group;
}

function bulletList(items: readonly Node[]): HTMLUListElement {
  const list = el('ul', { class: 'rd-list' });
  for (const item of items) {
    list.append(item);
  }
  return list;
}

function summaryCard(payload: RenderPayload): HTMLElement | null {
  const summary = payload.summary;
  // § 6.3 — the card exists only for a document that carries a § 7 block; the checklist
  // line is part of that card, not a card of its own (AC5's DOM half asserts exactly this).
  if (summary === null) {
    return null;
  }
  const card = el('aside', { class: 'rd-summary', 'aria-label': READER.summaryLabel });

  if (summary.tldr !== null && summary.tldr !== '') {
    card.append(el('h2', { class: 'rd-summary-label' }, [READER.tldrLabel]));
    card.append(el('p', {}, [summary.tldr]));
  }
  if (summary.decisions.length > 0) {
    card.append(el('h2', { class: 'rd-summary-label' }, [READER.decisionsLabel]));
    card.append(
      bulletList(
        summary.decisions.map((decision) =>
          el('li', {}, [
            decision.text,
            decision.rationale === null
              ? null
              : el('span', { class: 'dim' }, [` — ${decision.rationale}`])
          ])
        )
      )
    );
  }
  if (summary.risks.length > 0) {
    card.append(el('h2', { class: 'rd-summary-label' }, [READER.risksLabel]));
    card.append(
      bulletList(
        summary.risks.map((risk) =>
          risk.resolved
            ? el('li', { class: 'dim' }, [
                el('s', {}, [risk.text]),
                ' ',
                el('span', { class: 'chip chip-neutral' }, [READER.riskResolved])
              ])
            : el('li', {}, [risk.text])
        )
      )
    );
  }
  if (payload.checklist !== null) {
    card.append(
      el('p', { class: 'rd-checklist' }, [
        format(READER.checklist, {
          done: payload.checklist.done,
          total: payload.checklist.total,
          skipped: payload.checklist.skipped
        })
      ])
    );
  }
  return card;
}

function sourceButton(payload: RenderPayload): HTMLButtonElement {
  const button = el('button', { class: 'action', type: 'button' }, [READER.openSource]);
  button.addEventListener('click', () =>
    post({
      type: 'openSource',
      folderUri: payload.folderUri,
      artifactRelPath: payload.location.artifactRelPath
    })
  );
  return button;
}

function document_(payload: RenderPayload): HTMLElement {
  const main = el('main', { id: DOC_ID, tabindex: '-1' });
  if (payload.refused) {
    main.append(el('p', { class: 'empty' }, [payload.notice ?? READER.unreadable]));
    main.append(sourceButton(payload));
    return main;
  }
  // Safe by construction: `bodyHtml` holds only markdown-it output (`html: false`) and the
  // panel CSP admits no script without the nonce (§ 6.3).
  main.innerHTML = payload.bodyHtml;
  return main;
}

function render(payload: RenderPayload, root: HTMLElement): void {
  const continuing = current !== null && locationKey(current) === locationKey(payload.location);
  const stored = storedScroll();

  const fragment = document.createDocumentFragment();
  fragment.append(skipLink());
  fragment.append(breadcrumb(payload));
  const chips = heroChips(payload);
  if (chips !== null) {
    fragment.append(chips);
  }
  if (payload.notice !== null && !payload.refused) {
    fragment.append(el('p', { class: 'banner', role: 'note' }, [payload.notice]));
  }
  const card = summaryCard(payload);
  if (card !== null) {
    fragment.append(card);
  }
  const main = document_(payload);
  fragment.append(main);
  root.replaceChildren(fragment);

  current = payload.location;

  if (continuing && stored !== null && stored.key === locationKey(payload.location)) {
    // A plan being ticked off updates in place rather than jumping to the top.
    window.scrollTo(0, stored.scrollY);
    return;
  }
  api.setState({ key: locationKey(payload.location), scrollY: 0 });
  const anchor =
    payload.location.anchor === undefined
      ? null
      : document.getElementById(payload.location.anchor);
  if (anchor !== null) {
    anchor.scrollIntoView();
  } else {
    window.scrollTo(0, 0);
  }
  // § 6.6 — after each navigation, focus lands on the artifact's own heading.
  const heading = main.querySelector('h1, h2, h3');
  if (heading instanceof HTMLElement) {
    heading.tabIndex = -1;
    heading.focus();
  } else {
    main.focus();
  }
}

window.addEventListener('scroll', () => {
  if (current !== null) {
    api.setState({ key: locationKey(current), scrollY: window.scrollY });
  }
});

/** § 6.2's rewritten links, routed to their A2 messages by one delegated handler. */
document.addEventListener('click', (event: MouseEvent) => {
  const target = event.target;
  if (!(target instanceof Element) || current === null) {
    return;
  }
  const anchor = target.closest('a[data-artifact], a[data-file], a[data-external]');
  if (anchor === null) {
    return;
  }
  event.preventDefault();

  const artifact = anchor.getAttribute('data-artifact');
  if (artifact !== null) {
    const hash = artifact.indexOf('#');
    const relPath = hash < 0 ? artifact : artifact.slice(0, hash);
    post({
      type: 'openArtifact',
      folderUri: current.folderUri,
      artifactRelPath: relPath,
      variant: /\.html?$/i.test(relPath) ? 'html' : 'md',
      ...(hash < 0 ? {} : { anchor: artifact.slice(hash + 1) })
    });
    return;
  }
  const file = anchor.getAttribute('data-file');
  if (file !== null) {
    post({ type: 'openFile', workspaceRelPath: file });
    return;
  }
  const external = anchor.getAttribute('data-external');
  if (external !== null) {
    post({ type: 'openExternal', url: external });
  }
});

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'render'
  ) {
    const root = document.getElementById('root');
    if (root !== null) {
      render(message as RenderPayload, root);
    }
  }
});

post({ type: 'ready' });
