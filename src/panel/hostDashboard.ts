import * as crypto from 'node:crypto';
import { PANEL } from '../strings.ts';

/**
 * § 5.2–5.3 — Maister's own `dashboard.html` runs with its markup, styles and script logic
 * untouched. The extension makes exactly three insertions, all security plumbing, and never
 * reads or evaluates the task's `dashboard-data.js` itself.
 *
 * The insertions are decided by scanning the document tag by tag, attribute by attribute. A
 * regex cannot tell `src=` inside a quoted attribute value from a real `src` attribute, and
 * a nonce handed to a remote `<script src>` is the one route out of `default-src 'none'`.
 */

export interface DashboardResources {
  /** `webview.cspSource`. */
  readonly cspSource: string;
  /** `asWebviewUri(taskFolder)` with a trailing slash. */
  readonly baseHref: string;
  /** `asWebviewUri(dist/webview/shim.js)`. */
  readonly shimSrc: string;
}

export type Recognition = { recognized: true } | { recognized: false; reason: string };

export interface DashboardStat {
  readonly mtime: number;
  readonly size: number;
}

const ANY_IFRAME = /<iframe/i;

/** The tag names the insertions depend on; everything else is left alone. */
const SCANNED = ['script', 'meta'];

interface Tag {
  readonly name: string;
  /** Index of the `<`. */
  readonly start: number;
  /** Index just past the `>`. */
  readonly end: number;
  readonly attrs: ReadonlyMap<string, string>;
  /** The raw attribute text, so a rewritten opening tag keeps the author's spelling. */
  readonly attrText: string;
}

type Scan = { ok: true; tags: readonly Tag[] } | { ok: false; reason: string };

interface Edit {
  readonly at: number;
  readonly until: number;
  readonly text: string;
}

/**
 * The hosted document, or `null` when it cannot be hosted safely: a tag the attribute scan
 * cannot read, or a document that does not open with a conforming `<head>`. A CSP meta the
 * browser does not treat as head content is ignored, so an unplaceable policy must refuse
 * rather than host unprotected.
 */
export function hostDashboardHtml(source: string, resources: DashboardResources): string | null {
  const head = documentHead(source);
  if (head === null) {
    return null;
  }
  const scan = scanTags(source);
  if (!scan.ok) {
    return null;
  }
  const insertAt = headerInsertionPoint(scan.tags, head, closingHeadAt(source));

  const nonce = crypto.randomBytes(32).toString('base64');
  const edits: Edit[] = [
    { at: insertAt, until: insertAt, text: securityHeader(nonce, resources) }
  ];
  for (const tag of scan.tags) {
    if (tag.name === 'meta' && isForeignCsp(tag)) {
      edits.push({ at: tag.start, until: tag.end, text: '' });
    }
    if (tag.name === 'script' && !tag.attrs.has('src')) {
      edits.push({
        at: tag.start,
        until: tag.end,
        text: `<script nonce="${nonce}"${tag.attrText}>`
      });
    }
  }
  return applyEdits(source, edits);
}

function securityHeader(nonce: string, resources: DashboardResources): string {
  return (
    `\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ` +
    `img-src ${resources.cspSource} data:; style-src ${resources.cspSource} 'unsafe-inline'; ` +
    `font-src ${resources.cspSource}; script-src 'nonce-${nonce}';">` +
    `\n<base href="${resources.baseHref}">` +
    `\n<script nonce="${nonce}" src="${resources.shimSrc}"></script>`
  );
}

function isForeignCsp(tag: Tag): boolean {
  return tag.attrs.get('http-equiv')?.trim().toLowerCase() === 'content-security-policy';
}

/**
 * Audit I5: the header goes after the `<head>`'s own `<meta charset>` so the charset
 * declaration stays inside the first 1024 bytes whatever the workspace path length.
 */
function headerInsertionPoint(
  tags: readonly Tag[],
  head: Tag,
  closingHeadAt: number | null
): number {
  const headEnd = closingHeadAt ?? Number.MAX_SAFE_INTEGER;
  const charset = tags.find(
    (tag) =>
      tag.name === 'meta' &&
      tag.start > head.start &&
      tag.start < headEnd &&
      tag.attrs.has('charset')
  );
  return charset?.end ?? head.end;
}

/** Where `</head>` is, so the charset anchor is never picked from the body. */
function closingHeadAt(html: string): number | null {
  const at = /<\/head/i.exec(html);
  return at === null ? null : at.index;
}

function applyEdits(source: string, edits: readonly Edit[]): string {
  const ordered = [...edits].sort(
    (left, right) => left.at - right.at || left.until - left.at - (right.until - right.at)
  );
  let out = '';
  let cursor = 0;
  for (const edit of ordered) {
    out += source.slice(cursor, edit.at) + edit.text;
    cursor = edit.until;
  }
  return out + source.slice(cursor);
}

// --- the opening grammar ---------------------------------------------------

const BOM = '\uFEFF';
const DOCTYPE = '<!doctype';

/**
 * § 5.2 — where the policy goes. Searching an arbitrary document for a `<head>` cannot be
 * done without the browser's own tokenizer: a `<head>` inside `<noscript>`, `<template>`, an
 * attribute value or script text is head to a scan and not to Chromium, and a policy written
 * anywhere but real head content is silently ignored. So a hostable dashboard must instead
 * *begin* with one, matched from byte 0:
 *
 *     [BOM] whitespace [`<!DOCTYPE html>`] whitespace/comments `<html …>`
 *           whitespace/comments `<head …>`
 *
 * Nothing else can precede that head, so the head this returns is the browser's head too.
 * Anything that does not match is refused to the § 5.4 fallback view.
 */
function documentHead(html: string): Tag | null {
  let at = html.startsWith(BOM) ? BOM.length : 0;
  at = skipBlanks(html, at);
  if (html.slice(at, at + DOCTYPE.length).toLowerCase() === DOCTYPE) {
    const close = html.indexOf('>', at);
    if (close < 0 || html.slice(at + DOCTYPE.length, close).trim().toLowerCase() !== 'html') {
      return null;
    }
    at = close + 1;
  }
  at = skipBlanks(html, at);
  const htmlTag = readTag(html, at, 'html');
  if (htmlTag === null) {
    return null;
  }
  return readTag(html, skipBlanks(html, htmlTag.end), 'head');
}

/** Whitespace and well-formed comments, the only things allowed between the opening tags. */
function skipBlanks(html: string, from: number): number {
  let at = from;
  for (;;) {
    while (at < html.length && WHITESPACE.test(html[at])) {
      at += 1;
    }
    if (!html.startsWith('<!--', at)) {
      return at;
    }
    const close = html.indexOf('-->', at + 4);
    if (close < 0) {
      return at;
    }
    at = close + 3;
  }
}

function readTag(html: string, at: number, name: string): Tag | null {
  if (!startsTag(html, at, name)) {
    return null;
  }
  const parsed = parseStartTag(html, at + 1 + name.length);
  return parsed === null ? null : { name, start: at, ...parsed };
}

// --- the scanner -----------------------------------------------------------

const WHITESPACE = /\s/;
const ATTR_NAME_END = /[\s=/>]/;

/**
 * Walks the document once, collecting the opening tags the insertions care about. A comment
 * is skipped whole and a script element's raw text is skipped to its `</script`, so neither
 * can carry markup that looks like a tag to us and not to the browser.
 */
function scanTags(html: string): Scan {
  const tags: Tag[] = [];
  let cursor = 0;
  while (cursor < html.length) {
    const at = html.indexOf('<', cursor);
    if (at < 0) {
      break;
    }
    if (html.startsWith('<!--', at)) {
      const close = html.indexOf('-->', at + 4);
      if (close < 0) {
        break;
      }
      cursor = close + 3;
      continue;
    }
    const name = SCANNED.find((candidate) => startsTag(html, at, candidate));
    if (name === undefined) {
      cursor = at + 1;
      continue;
    }
    const parsed = parseStartTag(html, at + 1 + name.length);
    if (parsed === null) {
      return { ok: false, reason: PANEL.unrecognizedUnreadableTag };
    }
    tags.push({ name, start: at, ...parsed });
    if (name !== 'script') {
      cursor = parsed.end;
      continue;
    }
    const close = closingScriptAt(html, parsed.end);
    if (close === null) {
      return { ok: false, reason: PANEL.unrecognizedUnreadableTag };
    }
    cursor = close;
  }
  return { ok: true, tags };
}

function startsTag(html: string, at: number, name: string): boolean {
  if (html.slice(at + 1, at + 1 + name.length).toLowerCase() !== name) {
    return false;
  }
  const after = html[at + 1 + name.length];
  return after !== undefined && (after === '>' || after === '/' || WHITESPACE.test(after));
}

/** Chromium leaves a script's raw text only at `</script` followed by whitespace, `/` or `>`. */
function closingScriptAt(html: string, from: number): number | null {
  const closing = /<\/script(?=[\s/>])/gi;
  closing.lastIndex = from;
  const match = closing.exec(html);
  return match === null ? null : match.index;
}

/**
 * Reads the attributes of an opening tag whose name ends at `from`, or `null` when the tag
 * is not well formed — an unterminated quote or an unterminated tag, either of which makes
 * the document's real shape a guess.
 */
function parseStartTag(
  html: string,
  from: number
): { end: number; attrs: ReadonlyMap<string, string>; attrText: string } | null {
  const attrs = new Map<string, string>();
  let at = from;
  while (at < html.length) {
    const char = html[at];
    if (char === '>') {
      return { end: at + 1, attrs, attrText: html.slice(from, at) };
    }
    if (char === '/' && html[at + 1] === '>') {
      return { end: at + 2, attrs, attrText: html.slice(from, at) };
    }
    if (WHITESPACE.test(char) || char === '/') {
      at += 1;
      continue;
    }
    const nameAt = at;
    while (at < html.length && !ATTR_NAME_END.test(html[at])) {
      at += 1;
    }
    if (at === nameAt) {
      return null;
    }
    const name = html.slice(nameAt, at).toLowerCase();
    while (at < html.length && WHITESPACE.test(html[at])) {
      at += 1;
    }
    if (html[at] !== '=') {
      attrs.set(name, '');
      continue;
    }
    at += 1;
    while (at < html.length && WHITESPACE.test(html[at])) {
      at += 1;
    }
    const value = readAttrValue(html, at);
    if (value === null) {
      return null;
    }
    attrs.set(name, value.text);
    at = value.end;
  }
  return null;
}

function readAttrValue(html: string, at: number): { text: string; end: number } | null {
  const quote = html[at];
  if (quote === '"' || quote === "'") {
    const close = html.indexOf(quote, at + 1);
    return close < 0 ? null : { text: html.slice(at + 1, close), end: close + 1 };
  }
  let end = at;
  while (end < html.length && !/[\s>]/.test(html[end])) {
    end += 1;
  }
  return end === at ? null : { text: html.slice(at, end), end };
}

/** § 5.2 — the structural signature a hostable dashboard must carry. */
function signatureOf(source: string): Recognition {
  if (!source.includes('dashboard-data.js')) {
    return { recognized: false, reason: PANEL.unrecognizedNoLoader };
  }
  if (!source.includes('MAISTER_DATA')) {
    return { recognized: false, reason: PANEL.unrecognizedNoGlobal };
  }
  const scan = scanTags(source);
  if (!scan.ok) {
    return { recognized: false, reason: scan.reason };
  }
  if (documentHead(source) === null) {
    return { recognized: false, reason: PANEL.unrecognizedNoHead };
  }
  if (!scan.tags.some((tag) => tag.name === 'script' && !tag.attrs.has('src'))) {
    return { recognized: false, reason: PANEL.unrecognizedNoInlineScript };
  }
  if (ANY_IFRAME.test(source)) {
    return { recognized: false, reason: PANEL.unrecognizedIframe };
  }
  return { recognized: true };
}

/** Recognition is cached per `(mtime, size)`, so an unchanged dashboard is read once. */
export class DashboardRecognizer {
  private readonly cache = new Map<string, DashboardStat & { result: Recognition }>();

  async recognize(
    key: string,
    stat: DashboardStat,
    read: () => Promise<string>
  ): Promise<Recognition> {
    const cached = this.cache.get(key);
    if (cached !== undefined && cached.mtime === stat.mtime && cached.size === stat.size) {
      return cached.result;
    }
    const result = signatureOf(await read());
    this.cache.set(key, { ...stat, result });
    return result;
  }
}
