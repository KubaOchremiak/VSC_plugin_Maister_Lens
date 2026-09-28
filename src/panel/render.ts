import MarkdownIt, { type Renderer, type StateCore, type Token } from 'markdown-it';
import { parseSummaryRegion } from '../model/parseSummary.ts';
import type { SummaryBlock } from '../model/types.ts';
import { READER, format } from '../strings.ts';
import { hostDashboardHtml, type DashboardResources } from './hostDashboard.ts';

/**
 * § 6.2 — the whole markdown pipeline, in the extension host. The webview receives finished
 * HTML, so nothing in here may touch `vscode` or the DOM: that keeps the pipeline unit
 * testable and keeps the sanitization decision (`html: false`) auditable in one place.
 */

/** § 6.2 step 1 and § 6.4 — the same ceiling for a markdown artifact and an HTML companion. */
export const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;

const CACHE_SIZE = 30;
const MD_OR_HTML = /\.(md|html?)$/i;
const DOC = /\.md$/i;
const CHECK_MARKER = /^\[([ xX~])\]\s+/;

/**
 * Where the rendered document lives. An `artifact` sits in a task folder and links to its
 * `.md`/`.html` siblings; a `doc` sits under `.maister/docs` and links only to other `.md` docs,
 * so an `.html` there opens as a plain file.
 */
export interface RenderTarget {
  readonly kind: 'artifact' | 'doc';
  /** Base-relative path of the document being rendered, e.g. `implementation/plan.md`. */
  readonly artifactRelPath: string;
  /** The base directory relative to its workspace folder, e.g. `.maister/tasks/development/x`. */
  readonly baseRelPath: string;
  /** `asWebviewUri` for an image inside the base, or null when the resource cannot be served. */
  readonly imageUri: (baseRelPath: string) => string | null;
}

export interface Checklist {
  readonly done: number;
  readonly total: number;
  readonly skipped: number;
}

export interface RenderedArtifact {
  readonly summary: SummaryBlock | null;
  readonly checklist: Checklist | null;
  readonly bodyHtml: string;
}

/** The artifact arm of `PanelLocation`, declared structurally so render stays panel-free. */
export interface ReaderLocation {
  readonly mode: 'artifact';
  readonly folderUri: string;
  readonly artifactRelPath: string;
  readonly variant: 'md' | 'html';
  readonly anchor?: string;
}

export interface ReaderHero {
  readonly label: string;
  readonly artifactRelPath: string;
  readonly current: boolean;
}

/** The doc arm of `PanelLocation`; `docRelPath` is relative to `.maister/docs`. */
export interface DocLocation {
  readonly mode: 'doc';
  readonly docsFolderUri: string;
  readonly docRelPath: string;
  readonly anchor?: string;
}

/** § 6.2's posted payload for a task artifact. */
export interface RenderPayload {
  readonly type: 'render';
  readonly kind?: 'artifact';
  readonly location: ReaderLocation;
  readonly taskTitle: string;
  readonly folderUri: string;
  readonly artifactLabel: string;
  readonly summary: SummaryBlock | null;
  readonly checklist: Checklist | null;
  readonly bodyHtml: string;
  readonly heroes: readonly ReaderHero[];
  /** A degraded-mode line shown above the document; null when nothing degraded (§ 8.2). */
  readonly notice: string | null;
  /** True when the artifact was refused outright, so only the notice and the source button show. */
  readonly refused: boolean;
}

/** The posted payload for a project doc: there is no task, so no title, heroes or source. */
export interface DocRenderPayload {
  readonly type: 'render';
  readonly kind: 'doc';
  readonly location: DocLocation;
  readonly docLabel: string;
  readonly summary: SummaryBlock | null;
  readonly checklist: Checklist | null;
  readonly bodyHtml: string;
  readonly notice: string | null;
  readonly refused: boolean;
}

/** Everything the reader bundle can be posted. */
export type ReaderPayload = RenderPayload | DocRenderPayload;

/** The reader restores its scroll position only for a re-post of the artifact it is showing. */
export function sameArtifactLocation(left: ReaderLocation, right: ReaderLocation): boolean {
  return (
    left.folderUri === right.folderUri &&
    left.artifactRelPath === right.artifactRelPath &&
    left.variant === right.variant
  );
}

// --- size ------------------------------------------------------------------

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** § 6.2 step 1 — the refusal notice for an oversized artifact, or null when it fits. */
export function oversizeNotice(bytes: number): string | null {
  return bytes > MAX_ARTIFACT_BYTES ? format(READER.tooLarge, { size: formatSize(bytes) }) : null;
}

// --- path resolution -------------------------------------------------------

/** Resolves `.` and `..` inside a relative posix path; null when it climbs above the root. */
function normalizeRelative(relPath: string): string | null {
  const out: string[] = [];
  for (const segment of relPath.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (out.pop() === undefined) {
        return null;
      }
      continue;
    }
    out.push(segment);
  }
  return out.length === 0 ? null : out.join('/');
}

function parentOf(relPath: string): string {
  const at = relPath.lastIndexOf('/');
  return at < 0 ? '' : relPath.slice(0, at);
}

type LinkKind = 'fragment' | 'artifact' | 'file' | 'external';
interface LinkTarget {
  readonly kind: LinkKind;
  readonly value: string;
}

function decodePath(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** The base-relative path a relative reference points at, or null when it leaves the base. */
function insideBase(reference: string, target: RenderTarget): string | null {
  const decoded = decodePath(reference);
  if (decoded === null || decoded === '' || decoded.startsWith('/') || /^[a-z][\w+.-]*:/i.test(decoded)) {
    return null;
  }
  return normalizeRelative(`${parentOf(target.artifactRelPath)}/${decoded}`);
}

/** § 6.2 step 6's table, as one decision. `null` means the link is removed and the text kept. */
export function classifyLink(href: string, target: RenderTarget): LinkTarget | null {
  if (href.startsWith('#')) {
    return { kind: 'fragment', value: href };
  }
  if (href.startsWith('//')) {
    return null;
  }
  if (/^[a-z][\w+.-]*:/i.test(href)) {
    let url: URL;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? { kind: 'external', value: href }
      : null;
  }

  const hash = href.indexOf('#');
  const reference = hash < 0 ? href : href.slice(0, hash);
  const fragment = hash < 0 ? '' : href.slice(hash);
  if (reference === '') {
    return null;
  }

  const inBase = insideBase(reference, target);
  const readable = target.kind === 'doc' ? DOC : MD_OR_HTML;
  return inBase !== null && readable.test(inBase)
    ? { kind: 'artifact', value: `${inBase}${fragment}` }
    : workspaceFile(`${target.baseRelPath}/${parentOf(target.artifactRelPath)}/${reference}`);
}

function workspaceFile(candidate: string): LinkTarget | null {
  const decoded = decodePath(candidate);
  const resolved = decoded === null ? null : normalizeRelative(decoded);
  return resolved === null ? null : { kind: 'file', value: resolved };
}

// --- the markdown-it instance ----------------------------------------------

interface RenderEnv {
  readonly target: RenderTarget;
  readonly slugs: Map<string, number>;
  readonly links: LinkKind[];
  done: number;
  total: number;
  skipped: number;
}

const CHECK_GLYPHS = {
  ' ': { glyph: '☐', label: READER.checkNotDone },
  x: { glyph: '☑', label: READER.checkDone },
  '~': { glyph: '⊘', label: READER.checkSkipped }
} as const;

const md = new MarkdownIt({ html: false, linkify: true, typographer: false });
const escape = (text: string): string => md.utils.escapeHtml(text);

function slugify(text: string, slugs: Map<string, number>): string {
  const base =
    text
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
      .trim()
      .replace(/\s+/g, '-') || 'section';
  const seen = slugs.get(base) ?? 0;
  slugs.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen}`;
}

/** § 6.2 step 5 — GitHub-style heading slugs, de-duplicated, so deep links resolve. */
md.core.ruler.push('maister_anchors', (state: StateCore) => {
  const env = state.env as RenderEnv;
  state.tokens.forEach((token, index) => {
    if (token.type !== 'heading_open') {
      return;
    }
    const inline = state.tokens[index + 1];
    token.attrSet('id', slugify(inline?.content ?? '', env.slugs));
  });
});

/** § 6.2 step 4 — checklist markers become a labelled, non-interactive glyph. */
md.core.ruler.push('maister_checklist', (state: StateCore) => {
  const env = state.env as RenderEnv;
  state.tokens.forEach((token, index) => {
    if (token.type !== 'inline' || token.children === null) {
      return;
    }
    const first = token.children[0];
    if (first === undefined || first.type !== 'text') {
      return;
    }
    const marker = CHECK_MARKER.exec(first.content);
    if (marker === null) {
      return;
    }
    const key = marker[1].toLowerCase() as ' ' | 'x' | '~';
    const { glyph, label } = CHECK_GLYPHS[key];
    env.total += 1;
    if (key === 'x') {
      env.done += 1;
    } else if (key === '~') {
      env.skipped += 1;
    }

    first.content = first.content.slice(marker[0].length);
    const badge = new state.Token('html_inline', '', 0);
    badge.content = `<span class="check" aria-label="${escape(label)}">${glyph}</span> `;
    token.children.unshift(badge);

    for (let back = index; back >= 0; back -= 1) {
      if (state.tokens[back].type === 'list_item_open') {
        state.tokens[back].attrSet('class', 'check-item');
        break;
      }
    }
  });
});

md.renderer.rules.link_open = (tokens: Token[], index: number, _options, env): string => {
  const scope = env as RenderEnv;
  const link = classifyLink(tokens[index].attrGet('href') ?? '', scope.target);
  if (link === null) {
    scope.links.push('fragment');
    return '';
  }
  scope.links.push(link.kind);
  if (link.kind === 'fragment') {
    return `<a href="${escape(link.value)}">`;
  }
  return `<a href="#" data-${link.kind}="${escape(link.value)}">`;
};

md.renderer.rules.link_close = (_tokens, _index, _options, env): string => {
  const scope = env as RenderEnv;
  const kind = scope.links.pop();
  if (kind === undefined) {
    return '';
  }
  const suffix =
    kind === 'external'
      ? READER.opensInBrowser
      : kind === 'file'
        ? READER.opensInEditor
        : null;
  return suffix === null ? '</a>' : `<span class="sr-only"> ${escape(suffix)}</span></a>`;
};

/** § 6.2 step 7 — only images inside the base are served; everything else degrades to its alt text. */
md.renderer.rules.image = (
  tokens: Token[],
  index: number,
  options: unknown,
  env: unknown,
  self: Renderer
): string => {
  const scope = env as RenderEnv;
  const token = tokens[index];
  const alt = self.renderInlineAsText(token.children ?? [], options, env);
  const inBase = insideBase(token.attrGet('src') ?? '', scope.target);
  const uri = inBase === null ? null : scope.target.imageUri(inBase);
  if (uri === null) {
    return escape(`${alt} ${READER.imageNotLoaded}`.trim());
  }
  return `<img src="${escape(uri)}" alt="${escape(alt)}">`;
};

// --- the pipeline ----------------------------------------------------------

/**
 * Renders one markdown artifact. `html: false` is the entire sanitization strategy: every
 * tag in the output was produced here, so no sanitizer dependency is needed (§ 6.2 step 3).
 */
export function renderArtifact(markdown: string, target: RenderTarget): RenderedArtifact {
  const region = parseSummaryRegion(markdown, target.artifactRelPath);
  const body =
    region.bodyLine === 0
      ? markdown
      : markdown.split(/\r?\n/).slice(region.bodyLine).join('\n');

  const env: RenderEnv = {
    target,
    slugs: new Map(),
    links: [],
    done: 0,
    total: 0,
    skipped: 0
  };
  const bodyHtml = md.render(body, env);

  return {
    summary: region.summary,
    bodyHtml,
    checklist: env.total === 0 ? null : { done: env.done, total: env.total, skipped: env.skipped }
  };
}

// --- HTML companion (§ 6.4) ------------------------------------------------

export type CompanionResult = { readonly ok: true; readonly html: string } | { readonly ok: false; readonly notice: string };

/**
 * § 6.4 — a companion is re-hosted with the same three insertions as Maister's dashboard,
 * with `<base href>` at the artifact's own directory. A frame or an oversized file is
 * refused so the caller can fall back to the markdown variant with a stated reason.
 */
export function companionHtml(
  source: string,
  bytes: number,
  resources: DashboardResources
): CompanionResult {
  if (bytes > MAX_ARTIFACT_BYTES) {
    return { ok: false, notice: READER.companionTooLarge };
  }
  if (/<iframe/i.test(source)) {
    return { ok: false, notice: READER.companionIframe };
  }
  const html = hostDashboardHtml(source, resources);
  return html === null ? { ok: false, notice: READER.companionUnhostable } : { ok: true, html };
}

// --- cache (§ 6.2 step 9) --------------------------------------------------

export interface CacheKey {
  readonly path: string;
  readonly mtime: number;
  readonly size: number;
}

/** An LRU of 30 rendered results keyed by `(path, mtime, size)`, so a re-read is cheap. */
export class RenderCache<T> {
  private readonly entries = new Map<string, T>();

  get(key: CacheKey, build: () => T): T {
    const id = `${key.path}\u0000${key.mtime}\u0000${key.size}`;
    const cached = this.entries.get(id);
    if (cached !== undefined) {
      this.entries.delete(id);
      this.entries.set(id, cached);
      return cached;
    }
    const built = build();
    this.entries.set(id, built);
    if (this.entries.size > CACHE_SIZE) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) {
        this.entries.delete(oldest.value);
      }
    }
    return built;
  }
}
