import { PROJECT, format } from '../strings.ts';

export interface ProjectTldr {
  goal?: string;
  goalSource?: string;
  techStack?: string;
  techStackSource?: string;
}

export interface DocEntry {
  relPath: string;
  label: string;
}

export interface DocGroup {
  key: string;
  label: string;
  docs: DocEntry[];
}

const SECTION = /^##\s+project documentation\s*$/i;
const SECTION_END = /^##\s/;
const ENTRY = /^####\s+(.+?)\s*$/;
const HEADING = /^#{1,6}\s/;
const SOURCE = /\(`([^`]+)`\)/;
const VISION = /^vision\b/i;
const TECH_STACK = /^tech\s+stack\b/i;

const THEMATIC_BREAK = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const ITALIC_NOTE = /^\s*[*_][^*_].*[*_]\s*$/;
const INLINE_CODE = /`([^`]*)`/g;
const ACRONYMS = new Set(['css', 'api', 'ui', 'ux', 'html', 'json', 'tl;dr']);

/** The first prose paragraph of `lines`, ending at a blank line, heading or `---`; italic notes are skipped. */
function firstParagraph(lines: readonly string[]): string | undefined {
  const paragraph: string[] = [];
  for (const line of lines) {
    if (HEADING.test(line) || THEMATIC_BREAK.test(line)) {
      break;
    }
    const trimmed = line.trim();
    if (trimmed === '') {
      if (paragraph.length > 0) break;
      continue;
    }
    if (ITALIC_NOTE.test(trimmed)) {
      if (paragraph.length > 0) break;
      continue;
    }
    paragraph.push(trimmed);
  }
  return paragraph.length > 0 ? paragraph.join(' ').replace(INLINE_CODE, '$1') : undefined;
}

/** R4 — the TL;DR comes from the Vision and Tech Stack entries under `## Project Documentation`. */
export function parseProjectIndex(text: string): ProjectTldr {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => SECTION.test(l));
  if (start < 0) {
    return {};
  }
  const result: ProjectTldr = {};
  let i = start + 1;
  while (i < lines.length && !SECTION_END.test(lines[i])) {
    const match = ENTRY.exec(lines[i]);
    i++;
    if (!match) {
      continue;
    }
    const body: string[] = [];
    while (i < lines.length && !HEADING.test(lines[i])) {
      body.push(lines[i]);
      i++;
    }
    const heading = match[1];
    const source = SOURCE.exec(heading)?.[1];
    const content = firstParagraph(body);
    if (VISION.test(heading) && result.goal === undefined && content) {
      result.goal = content;
      if (source) result.goalSource = source;
    } else if (TECH_STACK.test(heading) && result.techStack === undefined && content) {
      result.techStack = content;
      if (source) result.techStackSource = source;
    }
  }
  return result;
}

/** The goal from vision.md: the first paragraph under its first `##` section, else its intro. */
export function parseVisionGoal(text: string): string | undefined {
  const lines = text.split(/\r?\n/);
  const section = lines.findIndex((l) => SECTION_END.test(l));
  if (section >= 0) {
    const goal = firstParagraph(lines.slice(section + 1));
    if (goal) return goal;
  }
  const intro = lines.slice(0, section < 0 ? lines.length : section).filter((l) => !/^#\s/.test(l));
  return firstParagraph(intro);
}

/** `coding-style.md` → "Coding style"; known acronyms stay uppercase (`css.md` → "CSS"). */
export function humanizeDocName(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath;
  const words = base
    .replace(/\.md$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : word))
    .join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function groupOf(relPath: string): {
  key: string;
  label: string;
  rank: number;
} {
  const parts = relPath.split('/');
  if (parts.length === 1) {
    return relPath.toLowerCase() === 'index.md'
      ? { key: 'index', label: PROJECT.groupIndex, rank: 0 }
      : { key: '.', label: PROJECT.groupOther, rank: 3 };
  }
  if (parts[0] === 'project') {
    return { key: 'project', label: PROJECT.groupProject, rank: 1 };
  }
  if (parts[0] === 'standards' && parts.length > 2) {
    return {
      key: `standards/${parts[1]}`,
      label: format(PROJECT.groupStandards, { domain: capitalize(parts[1]) }),
      rank: 2
    };
  }
  return { key: parts[0], label: capitalize(parts[0]), rank: 3 };
}

/** R3 — INDEX.md, then `project/`, then `standards/<domain>/`, then other folders, all alphabetical. */
export function groupDocs(relPaths: readonly string[]): DocGroup[] {
  const groups = new Map<string, DocGroup & { rank: number }>();
  for (const relPath of relPaths) {
    const { key, label, rank } = groupOf(relPath);
    let group = groups.get(key);
    if (!group) {
      group = { key, label, rank, docs: [] };
      groups.set(key, group);
    }
    group.docs.push({
      relPath,
      label: relPath.toLowerCase() === 'index.md' ? 'INDEX.md' : humanizeDocName(relPath)
    });
  }
  return [...groups.values()]
    .sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key))
    .map(({ key, label, docs }) => ({
      key,
      label,
      docs: docs.sort((a, b) => a.relPath.localeCompare(b.relPath))
    }));
}
