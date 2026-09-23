import { readRisk } from './parseState.ts';
import type { Decision, SummaryBlock } from './types.ts';

/** § 2.5 — the block sits at the top of the document, so only the head is read. */
const MAX_BYTES = 8 * 1024;
const MAX_TLDR = 1000;
/** The leading region ends at the first thematic break or the fourth heading. */
const MAX_LEADING_HEADINGS = 4;

const HEADING = /^(#{2,3})\s*(.+?)\s*$/;
const TLDR = /^tl;?\s*dr\b/i;
const KEY_DECISIONS = /^key decisions\b/i;
const RISKS = /^(open questions\s*(\/|&|and)\s*risks|risks|open questions)\b/i;
const BULLET = /^[-*+]\s+(.*)$/;
const RATIONALE_SEPARATORS = [' — ', ' – ', ' - '];

type SectionKind = 'tldr' | 'decisions' | 'risks';

function sectionKind(heading: string): SectionKind | null {
  if (TLDR.test(heading)) {
    return 'tldr';
  }
  if (KEY_DECISIONS.test(heading)) {
    return 'decisions';
  }
  if (RISKS.test(heading)) {
    return 'risks';
  }
  return null;
}

/** Index of the first line after front matter and an opening `# Title`. */
function preambleEnd(lines: readonly string[]): number {
  let start = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
    if (end > 0) {
      start = end + 1;
    }
  }
  const h1 = lines.findIndex((line, i) => i >= start && /^#\s+/.test(line));
  if (h1 >= start && lines.slice(start, h1).every((line) => line.trim() === '')) {
    start = h1 + 1;
  }
  return start;
}

function bulletsOf(body: readonly string[]): string[] {
  const bullets: string[] = [];
  for (const line of body) {
    const match = BULLET.exec(line.trim());
    if (match !== null && match[1].trim() !== '') {
      bullets.push(match[1].trim());
    }
  }
  return bullets;
}

function splitDecision(bullet: string, source: string): Decision {
  for (const separator of RATIONALE_SEPARATORS) {
    const at = bullet.indexOf(separator);
    if (at > 0) {
      return {
        text: bullet.slice(0, at).trim(),
        rationale: bullet.slice(at + separator.length).trim(),
        source
      };
    }
  }
  return { text: bullet, rationale: null, source };
}

/** The § 7 block plus where the leading region it was read from ends. */
export interface SummaryRegion {
  summary: SummaryBlock | null;
  /**
   * 0-based index, into `markdown.split(/\r?\n/)`, of the first body line after the region.
   * `0` whenever no region was detected, so the body is left intact (§ 6.2 step 2).
   */
  bodyLine: number;
}

/**
 * Extracts the § 7 summary block from a markdown artifact and reports where its leading
 * region ends. `source` is the artifact's task-relative path, which becomes the source of
 * every decision and risk it yields.
 *
 * The region end is produced by the same single scan that collects the sections; § 6.2's
 * reader removes the region from the body, and a second heading scan there would drift.
 */
export function parseSummaryRegion(markdown: string, source: string): SummaryRegion {
  const lines = markdown.slice(0, MAX_BYTES).split(/\r?\n/);
  const start = preambleEnd(lines);

  const sections = new Map<SectionKind, string[]>();
  let headings = 0;
  let open: { kind: SectionKind; level: number } | null = null;
  let regionEnd: number | null = null;

  /** A heading that is not a section closes the region, unless a later section reopens it. */
  const closeAt = (at: number): void => {
    if (sections.size > 0 && regionEnd === null) {
      regionEnd = at;
    }
  };

  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      regionEnd = i;
      break;
    }
    const heading = HEADING.exec(line);
    const anyHeading = /^#{1,6}\s+/.test(line);
    if (heading === null) {
      if (anyHeading) {
        headings += 1;
        if (headings > MAX_LEADING_HEADINGS) {
          regionEnd = i;
          break;
        }
        closeAt(i);
        open = null;
        continue;
      }
      if (open !== null) {
        sections.get(open.kind)?.push(line);
      }
      continue;
    }

    headings += 1;
    if (headings > MAX_LEADING_HEADINGS) {
      regionEnd = i;
      break;
    }
    const level = heading[1].length;
    if (open !== null && level > open.level) {
      sections.get(open.kind)?.push(line);
      continue;
    }
    const kind = sectionKind(heading[2]);
    if (kind === null || sections.has(kind)) {
      closeAt(i);
      open = null;
      continue;
    }
    sections.set(kind, []);
    regionEnd = null;
    open = { kind, level };
  }

  if (sections.size === 0) {
    return { summary: null, bodyLine: 0 };
  }

  const tldrBody = (sections.get('tldr') ?? []).join('\n').trim();
  return {
    summary: {
      tldr: tldrBody === '' ? null : tldrBody.slice(0, MAX_TLDR),
      decisions: bulletsOf(sections.get('decisions') ?? []).map((bullet) =>
        splitDecision(bullet, source)
      ),
      risks: bulletsOf(sections.get('risks') ?? [])
        .map((bullet) => readRisk(bullet, source))
        .filter((risk): risk is NonNullable<typeof risk> => risk !== null)
    },
    bodyLine: regionEnd ?? lines.length
  };
}

/** The block alone, for the index tier that never renders a body. */
export function parseSummary(markdown: string, source: string): SummaryBlock | null {
  return parseSummaryRegion(markdown, source).summary;
}
