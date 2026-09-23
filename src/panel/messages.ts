/**
 * The A2 message table as the one security allowlist for every webview surface: a message is
 * acted on only when its `type` is listed here, its payload has the listed keys with the
 * listed primitive types, and every containment, membership and trust rule passes.
 * Everything else is refused with a stated reason, which the caller logs.
 *
 * This module is deliberately free of `vscode`, so the boundary can be unit-tested.
 */

import { containedRelPath } from '../model/relPath.ts';

const MAX_TEXT_CHARS = 200;
const MAX_FACET_MEMBERS = 16;
const MAX_EMAIL_CHARS = 320;
const MAX_QUIET_DAYS = 3650;
const ANCHOR = /^[-\w.]{1,128}$/;

const STATE_FILE = 'orchestrator-state.yml';

const WORKFLOW_TYPES = [
  'development',
  'product-design',
  'research',
  'migration',
  'performance',
  'unknown'
] as const;

const TASK_STATUSES = [
  'in_progress',
  'blocked',
  'pending',
  'failed',
  'completed',
  'unknown'
] as const;

const VERDICTS = ['passed', 'passed_with_issues', 'failed', 'none'] as const;

export type Variant = 'md' | 'html';

export type Message =
  | { type: 'ready' }
  | { type: 'navigate'; href: string; targetRelPath: string }
  | { type: 'openTask'; folderUri: string }
  | {
      type: 'openArtifact';
      folderUri: string;
      artifactRelPath: string;
      variant: Variant;
      anchor?: string;
    }
  | { type: 'openSource'; folderUri: string; artifactRelPath: string }
  | { type: 'openFile'; folderUri: string; workspaceRelPath: string }
  | { type: 'openExternal'; url: string }
  | { type: 'openInBrowser'; folderUri: string; artifactRelPath: string }
  | { type: 'setFilter'; patch: Record<string, unknown> }
  | { type: 'clearFilter' }
  | { type: 'openDashboard' }
  | { type: 'openRisks'; folderUri?: string }
  | { type: 'startWorkflow' }
  | { type: 'runNextAction'; folderUri: string };

export interface MessageContext {
  /** A1 — index membership is a single lookup on `folderUri`. */
  isIndexed: (folderUri: string) => boolean;
  isTrusted: boolean;
  /** Task folder of the document that sent a `navigate`; without it, `navigate` is refused. */
  hostFolderUri?: string;
  /**
   * The workspace folder the surface's workspace-relative paths are rooted at — the folder
   * holding the task on screen. `openFile` resolves inside it and nowhere else; without it
   * there is no root to contain against, so `openFile` is refused.
   */
  workspaceRootUri?: string;
}

export type Validation = { ok: true; message: Message } | { ok: false; reason: string };

/** A2.2 — the three messages that hand task-authored content or commands to the machine. */
const TRUST_GATED = new Set(['startWorkflow', 'runNextAction', 'openInBrowser']);

function refuse(reason: string): Validation {
  return { ok: false, reason };
}

function accept(message: Message): Validation {
  return { ok: true, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEnumArray(value: unknown, allowed: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length <= MAX_FACET_MEMBERS &&
    value.every((member) => typeof member === 'string' && allowed.includes(member))
  );
}

/**
 * Resolves `relPath` against `folderUri` and returns the folder-relative result, or `null`
 * when it points at anything outside that folder. Decoding comes first and normalizing
 * second, so `%2e%2e%2f` is a `..` segment by the time containment is decided; an absolute
 * path, a foreign scheme and a backslash separator are all refused outright.
 */
export function resolveInside(folderUri: string, relPath: string): string | null {
  try {
    new URL(folderUri.endsWith('/') ? folderUri : `${folderUri}/`);
  } catch {
    return null;
  }
  const withoutTail = relPath.split('#')[0].split('?')[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(withoutTail);
  } catch {
    return null;
  }
  return containedRelPath(decoded);
}

function validPatch(patch: unknown): Record<string, unknown> | null {
  if (!isRecord(patch)) {
    return null;
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      continue;
    }
    switch (key) {
      case 'text':
        if (typeof value !== 'string' || value.length > MAX_TEXT_CHARS) {
          return null;
        }
        break;
      case 'types':
        if (!isEnumArray(value, WORKFLOW_TYPES)) {
          return null;
        }
        break;
      case 'statuses':
        if (!isEnumArray(value, TASK_STATUSES)) {
          return null;
        }
        break;
      case 'verdicts':
        if (!isEnumArray(value, VERDICTS)) {
          return null;
        }
        break;
      case 'author':
        if (value === 'me' || value === 'others') {
          break;
        }
        if (
          !isRecord(value) ||
          typeof value.email !== 'string' ||
          value.email.length > MAX_EMAIL_CHARS
        ) {
          return null;
        }
        break;
      case 'quietAtLeastDays':
        if (
          typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > MAX_QUIET_DAYS
        ) {
          return null;
        }
        break;
      case 'createdAfter':
      case 'createdBefore':
        if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
          return null;
        }
        break;
      default:
        return null;
    }
  }
  return patch;
}

function indexedFolder(raw: Record<string, unknown>, context: MessageContext): string | null {
  return typeof raw.folderUri === 'string' && context.isIndexed(raw.folderUri)
    ? raw.folderUri
    : null;
}

function validateArtifact(raw: Record<string, unknown>, context: MessageContext): Validation {
  const folderUri = indexedFolder(raw, context);
  if (folderUri === null) {
    return refuse('openArtifact carries a folderUri that is not in the index');
  }
  if (typeof raw.artifactRelPath !== 'string') {
    return refuse('openArtifact carries no artifactRelPath');
  }
  const artifactRelPath = resolveInside(folderUri, raw.artifactRelPath);
  if (artifactRelPath === null) {
    return refuse(`openArtifact path ${raw.artifactRelPath} resolves outside its task folder`);
  }
  if (raw.variant !== 'md' && raw.variant !== 'html') {
    return refuse('openArtifact carries no md/html variant');
  }
  if (raw.anchor !== undefined && (typeof raw.anchor !== 'string' || !ANCHOR.test(raw.anchor))) {
    return refuse('openArtifact carries an anchor outside /^[-\\w.]{1,128}$/');
  }
  const message: Message = {
    type: 'openArtifact',
    folderUri,
    artifactRelPath,
    variant: raw.variant
  };
  return accept(raw.anchor === undefined ? message : { ...message, anchor: raw.anchor });
}

function validateNavigate(raw: Record<string, unknown>, context: MessageContext): Validation {
  if (typeof raw.href !== 'string') {
    return refuse('navigate carries no href');
  }
  if (context.hostFolderUri === undefined) {
    return refuse(`navigate from a surface that hosts no task folder: ${raw.href}`);
  }
  // A2.1 — containment is the single final word, so another task's dashboard is out of folder.
  const targetRelPath = resolveInside(context.hostFolderUri, raw.href);
  if (targetRelPath === null) {
    return refuse(`navigate to ${raw.href} resolves outside the hosting task folder`);
  }
  return accept({ type: 'navigate', href: raw.href, targetRelPath });
}

function validateInBrowser(raw: Record<string, unknown>, context: MessageContext): Validation {
  const folderUri = indexedFolder(raw, context);
  if (folderUri === null) {
    return refuse('openInBrowser carries a folderUri that is not in the index');
  }
  if (typeof raw.artifactRelPath !== 'string') {
    return refuse('openInBrowser carries no artifactRelPath');
  }
  const artifactRelPath = resolveInside(folderUri, raw.artifactRelPath);
  if (artifactRelPath === null || !/\.html?$/i.test(artifactRelPath)) {
    return refuse(`openInBrowser path ${raw.artifactRelPath} is not an html file inside the task`);
  }
  return accept({ type: 'openInBrowser', folderUri, artifactRelPath });
}

/**
 * A workspace-relative path means nothing without the folder it is relative to, and every
 * relative path is lexically inside every folder — so the root is the surface's own
 * workspace folder, and it travels with the message rather than being guessed downstream.
 */
function validateOpenFile(raw: Record<string, unknown>, context: MessageContext): Validation {
  if (typeof raw.workspaceRelPath !== 'string') {
    return refuse('openFile carries no workspaceRelPath');
  }
  const folderUri = context.workspaceRootUri;
  if (folderUri === undefined) {
    return refuse(`openFile from a surface that hosts no workspace folder: ${raw.workspaceRelPath}`);
  }
  const workspaceRelPath = resolveInside(folderUri, raw.workspaceRelPath);
  return workspaceRelPath === null
    ? refuse(`openFile path ${raw.workspaceRelPath} resolves outside its workspace folder`)
    : accept({ type: 'openFile', folderUri, workspaceRelPath });
}

function validateExternal(raw: Record<string, unknown>): Validation {
  if (typeof raw.url !== 'string') {
    return refuse('openExternal carries no url');
  }
  let url: URL;
  try {
    url = new URL(raw.url);
  } catch {
    return refuse(`openExternal carries an unreadable url: ${raw.url}`);
  }
  return url.protocol === 'http:' || url.protocol === 'https:'
    ? accept({ type: 'openExternal', url: raw.url })
    : refuse(`openExternal scheme ${url.protocol} is not http(s)`);
}

export function validate(raw: unknown, context: MessageContext): Validation {
  if (!isRecord(raw) || typeof raw.type !== 'string') {
    return refuse('a message with no type');
  }
  if (TRUST_GATED.has(raw.type) && !context.isTrusted) {
    return refuse(`${raw.type} needs a trusted workspace`);
  }

  switch (raw.type) {
    case 'ready':
      return accept({ type: 'ready' });
    case 'clearFilter':
      return accept({ type: 'clearFilter' });
    case 'openDashboard':
      return accept({ type: 'openDashboard' });
    case 'startWorkflow':
      return accept({ type: 'startWorkflow' });
    case 'navigate':
      return validateNavigate(raw, context);
    case 'setFilter': {
      const patch = validPatch(raw.patch);
      return patch === null
        ? refuse('setFilter carries a patch outside the TaskQuery bounds')
        : accept({ type: 'setFilter', patch });
    }
    case 'openTask':
    case 'runNextAction': {
      const folderUri = indexedFolder(raw, context);
      return folderUri === null
        ? refuse(`${raw.type} carries a folderUri that is not in the index`)
        : accept({ type: raw.type, folderUri });
    }
    case 'openRisks': {
      if (raw.folderUri === undefined) {
        return accept({ type: 'openRisks' });
      }
      const folderUri = indexedFolder(raw, context);
      return folderUri === null
        ? refuse('openRisks carries a folderUri that is not in the index')
        : accept({ type: 'openRisks', folderUri });
    }
    case 'openArtifact':
      return validateArtifact(raw, context);
    case 'openSource': {
      const folderUri = indexedFolder(raw, context);
      if (folderUri === null) {
        return refuse('openSource carries a folderUri that is not in the index');
      }
      if (raw.artifactRelPath === undefined) {
        return accept({ type: 'openSource', folderUri, artifactRelPath: STATE_FILE });
      }
      if (typeof raw.artifactRelPath !== 'string') {
        return refuse('openSource carries a non-string artifactRelPath');
      }
      const artifactRelPath = resolveInside(folderUri, raw.artifactRelPath);
      return artifactRelPath === null
        ? refuse(`openSource path ${raw.artifactRelPath} resolves outside its task folder`)
        : accept({ type: 'openSource', folderUri, artifactRelPath });
    }
    case 'openFile':
      return validateOpenFile(raw, context);
    case 'openExternal':
      return validateExternal(raw);
    case 'openInBrowser':
      return validateInBrowser(raw, context);
    default:
      return refuse(`${raw.type} is not in the A2 table`);
  }
}

/** The subset the Overview view provider can act on; it applies its own trust gate. */
const OVERVIEW_TYPES = new Set([
  'ready',
  'setFilter',
  'clearFilter',
  'openTask',
  'openArtifact',
  'openDashboard',
  'openRisks',
  'startWorkflow',
  'runNextAction'
]);

export type OverviewMessage = Extract<
  Message,
  {
    type:
      | 'ready'
      | 'setFilter'
      | 'clearFilter'
      | 'openTask'
      | 'openArtifact'
      | 'openDashboard'
      | 'openRisks'
      | 'startWorkflow'
      | 'runNextAction';
  }
>;

/**
 * Overview's door onto the same table. Trust is applied by the caller there, because the
 * Overview provider logs its own refusal wording; the shape rules are these ones.
 */
export function validateOverviewMessage(
  raw: unknown,
  isIndexed: (folderUri: string) => boolean
): OverviewMessage | null {
  const result = validate(raw, { isIndexed, isTrusted: true });
  if (!result.ok || !OVERVIEW_TYPES.has(result.message.type)) {
    return null;
  }
  return result.message as OverviewMessage;
}
