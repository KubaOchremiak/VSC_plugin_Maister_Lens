import type { DocGroup, ProjectTldr } from '../model/parseProjectDocs.ts';
import { OVERVIEW, PROJECT, format } from '../strings.ts';
import { el, row, summaryCard } from './components.ts';

/**
 * The Project page: per workspace folder, a TL;DR of the Vision and Tech Stack entries of
 * `.maister/docs/INDEX.md`, then every doc grouped INDEX > project > standards > other.
 * The stack is shown verbatim as text; nothing is inferred from it.
 */

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};

/** One workspace folder that carries `.maister/docs`. */
export interface ProjectSection {
  readonly folderName: string;
  /** The workspace folder URI an `openDoc` from this section carries. */
  readonly docsFolderUri: string;
  /** Absent fields are shown as honestly missing; the sources are `.maister/docs`-relative. */
  readonly tldr: ProjectTldr;
  readonly groups: readonly DocGroup[];
}

/** The Project page payload; `empty` is true when no folder has `.maister/docs` (R6). */
export interface ProjectPayload {
  readonly type: 'project';
  /** The folder name heads each section only when the workspace has more than one root. */
  readonly multiRoot: boolean;
  readonly sections: readonly ProjectSection[];
  readonly empty: boolean;
}

const INIT_COMMAND = '/maister:init';

const api = acquireVsCodeApi();

function openDoc(section: ProjectSection, docRelPath: string): void {
  api.postMessage({ type: 'openDoc', docsFolderUri: section.docsFolderUri, docRelPath });
}

function tldrField(
  section: ProjectSection,
  label: string,
  value: string,
  source: string | undefined
): HTMLElement {
  const card = summaryCard({ label, value });
  if (source !== undefined) {
    const link = el('button', { class: 'link', type: 'button' }, [source]);
    link.addEventListener('click', () => openDoc(section, source));
    card.append(link);
  }
  return card;
}

function missingNote(label: string): HTMLElement {
  return el('p', { class: 'dim missing-note' }, [format(PROJECT.missing, { field: label })]);
}

function tldrCard(section: ProjectSection): HTMLElement {
  const { goal, goalSource, techStack, techStackSource } = section.tldr;
  return el('section', { class: 'card project-tldr', 'aria-label': PROJECT.heading }, [
    goal === undefined
      ? missingNote(PROJECT.goalLabel)
      : tldrField(section, PROJECT.goalLabel, goal, goalSource),
    techStack === undefined
      ? missingNote(PROJECT.techStackLabel)
      : tldrField(section, PROJECT.techStackLabel, techStack, techStackSource)
  ]);
}

function docGroup(section: ProjectSection, group: DocGroup): HTMLElement {
  const header = el('button', { class: 'group-header', type: 'button' }, [
    format(OVERVIEW.groupHeader, { group: group.label, count: group.docs.length })
  ]);
  header.setAttribute('aria-expanded', 'true');

  const list = el('ul', { class: 'plain' });
  for (const doc of group.docs) {
    list.append(
      row({
        title: doc.label,
        statusGlyph: '',
        statusText: '',
        description: doc.relPath,
        markers: [],
        onOpen: () => openDoc(section, doc.relPath)
      })
    );
  }

  header.addEventListener('click', () => {
    const open = header.getAttribute('aria-expanded') !== 'true';
    header.setAttribute('aria-expanded', String(open));
    list.hidden = !open;
  });

  return el('section', { class: 'group' }, [el('h3', { class: 'group-heading' }, [header]), list]);
}

function folderSection(section: ProjectSection, multiRoot: boolean): HTMLElement {
  return el('section', { class: 'project-folder' }, [
    multiRoot ? el('h2', {}, [section.folderName]) : null,
    tldrCard(section),
    ...section.groups.map((group) => docGroup(section, group))
  ]);
}

function emptyState(): HTMLElement {
  const [before, after] = PROJECT.initHint.split(INIT_COMMAND);
  return el('div', { class: 'empty', role: 'status' }, [
    el('p', {}, [PROJECT.empty]),
    el('p', {}, [before, el('code', {}, [INIT_COMMAND]), after])
  ]);
}

export function render(payload: ProjectPayload, root: HTMLElement): void {
  const fragment = document.createDocumentFragment();
  fragment.append(el('h1', {}, [PROJECT.heading]));
  if (payload.empty) {
    fragment.append(emptyState());
  } else {
    for (const section of payload.sections) {
      fragment.append(folderSection(section, payload.multiRoot));
    }
  }
  root.replaceChildren(fragment);
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  const message = event.data;
  const root = document.getElementById('root');
  if (
    root !== null &&
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'project'
  ) {
    render(message as ProjectPayload, root);
  }
});

api.postMessage({ type: 'ready' });
