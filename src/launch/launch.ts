/**
 * § 7 — composing `/maister:*` commands and handing them to an assistant or a terminal.
 * The extension never writes a task file and never runs a workflow itself (§ 7.7).
 *
 * This module is free of `vscode`: every host capability arrives through `LaunchHost`, so the
 * target chain, the command composition and the shell quoting are unit-testable without a host.
 */

import type { NextActionId } from '../model/types.ts';
import { LAUNCH, format } from '../strings.ts';

export type LaunchTarget = 'claudeCode' | 'copilotChat' | 'terminal' | 'clipboard';

export const DEFAULT_TARGET_ORDER: readonly LaunchTarget[] = [
  'claudeCode',
  'copilotChat',
  'terminal',
  'clipboard'
];

export const CLAUDE_CODE_EXTENSION_ID = 'anthropic.claude-code';
export const CLAUDE_CODE_OPEN_COMMAND = 'claude-vscode.editor.open';
export const COPILOT_CHAT_EXTENSION_ID = 'GitHub.copilot-chat';
export const COPILOT_CHAT_OPEN_COMMAND = 'workbench.action.chat.open';
export const TARGET_ORDER_SETTING = 'maisterLens.launch.targetOrder';
export const NEW_TERMINAL_NAME = 'Claude Code · Maister';

/** The § 7.3 step-1 workflow choices, `Let Maister decide` first. */
export const WORKFLOW_SKILLS = [
  'work',
  'development',
  'product-design',
  'research',
  'migration',
  'performance'
] as const;

export type WorkflowSkill = (typeof WORKFLOW_SKILLS)[number];

export const DESCRIPTION_MIN_CHARS = 1;
export const DESCRIPTION_MAX_CHARS = 2000;

export interface PickItem<T> {
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
  readonly value: T;
}

export interface TerminalHandle {
  readonly name: string;
  show(): void;
  sendText(text: string, submit: boolean): void;
}

/** Everything § 7 needs from the editor, named so a test can supply it. */
export interface LaunchHost {
  log(line: string): void;
  isTrusted(): boolean;
  targetOrder(): unknown;
  autoSubmit(): boolean;
  preferredTerminalName(): string;
  hasExtension(id: string): boolean;
  activateExtension(id: string): Promise<void>;
  commandExists(id: string): Promise<boolean>;
  executeCommand(id: string, ...args: unknown[]): Promise<unknown>;
  readonly uriScheme: string;
  openExternal(uri: string): Promise<void>;
  copyToClipboard(text: string): Promise<void>;
  shell(): string | undefined;
  openTerminals(): TerminalHandle[];
  activeTerminalName(): string | undefined;
  createTerminal(name: string): TerminalHandle;
  rememberedTerminalName(): string | undefined;
  rememberTerminalName(name: string): Promise<void>;
  pick<T>(items: PickItem<T>[], placeholder: string): Promise<T | undefined>;
  input(options: {
    prompt: string;
    placeholder: string;
    value: string;
    validate: (value: string) => string | null;
  }): Promise<string | undefined>;
  statusMessage(text: string): void;
  /** Resolves true when the action button was pressed. */
  notice(message: string, action: string): Promise<boolean>;
  wasCopilotNoticeShown(): boolean;
  markCopilotNoticeShown(): Promise<void>;
  openSetting(id: string): Promise<void>;
}

// --- composition (§ 7.1, § 7.2) ---------------------------------------------

export interface NextActionInput {
  /** Workspace-folder-relative task path — never the folderUri, which is identity only (A1). */
  readonly relPath: string;
  readonly action: NextActionId;
  /** Only `fromResearch` needs a continuation and a description (§ 7.2). */
  readonly research?: { kind: 'design' | 'develop'; description: string };
}

/** § 7.2 — Resume is `/maister:work {relPath}` for all five types, never `/maister:{type}` (A7). */
export function nextActionCommand(input: NextActionInput): string | null {
  switch (input.action) {
    case 'resume':
      return `/maister:work ${input.relPath}`;
    case 'startDevelopment':
      return `/maister:development ${input.relPath}`;
    case 'fromResearch': {
      if (input.research === undefined) {
        return null;
      }
      const skill = input.research.kind === 'design' ? 'product-design' : 'development';
      return `/maister:${skill} ${input.research.description} --research=${input.relPath}`;
    }
    case 'none':
      return null;
  }
}

export function startWorkflowCommand(skill: WorkflowSkill, description: string): string {
  return `/maister:${skill} ${description}`;
}

/** § 7.3 step 2 — line breaks collapse to spaces before length is judged. */
export function normalizeDescription(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Returns the field-specific message the input box shows, or null when the value is usable. */
export function describeDescriptionError(raw: string): string | null {
  const value = normalizeDescription(raw);
  if (value.length < DESCRIPTION_MIN_CHARS) {
    return LAUNCH.descriptionEmpty;
  }
  if (value.length > DESCRIPTION_MAX_CHARS) {
    return format(LAUNCH.descriptionTooLong, { max: DESCRIPTION_MAX_CHARS, n: value.length });
  }
  return null;
}

// --- target order (§ 7.4) ---------------------------------------------------

function isLaunchTarget(value: unknown): value is LaunchTarget {
  return typeof value === 'string' && (DEFAULT_TARGET_ORDER as readonly string[]).includes(value);
}

/** An empty, duplicated or otherwise invalid setting is treated as the default, with a warning. */
export function normalizeTargetOrder(raw: unknown): {
  order: LaunchTarget[];
  warning: string | null;
} {
  if (!Array.isArray(raw) || raw.length === 0 || !raw.every(isLaunchTarget)) {
    return { order: [...DEFAULT_TARGET_ORDER], warning: LAUNCH.targetOrderInvalid };
  }
  const order = [...new Set(raw)];
  if (order.length !== raw.length) {
    return { order: [...DEFAULT_TARGET_ORDER], warning: LAUNCH.targetOrderInvalid };
  }
  return { order, warning: null };
}

// --- shell quoting (§ 7.5) --------------------------------------------------

const POWERSHELL = /(^|[\\/])(pwsh|powershell)(\.exe)?$/i;
const CMD = /(^|[\\/])cmd(\.exe)?$/i;

/**
 * Quotes a composed command as a single argument. The extension never builds a command
 * *through* a shell — this only protects the one literal it types into a new terminal.
 */
export function quoteForShell(text: string, shell: string | undefined): string {
  const name = shell ?? '';
  if (POWERSHELL.test(name)) {
    return `'${text.replace(/'/g, "''")}'`;
  }
  if (CMD.test(name)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return `'${text.replace(/'/g, "'\\''")}'`;
}

// --- the chain (§ 7.4, A7) --------------------------------------------------

type TargetOutcome =
  | { kind: 'done'; message: string }
  | { kind: 'unavailable' }
  | { kind: 'aborted' };

const UNAVAILABLE: TargetOutcome = { kind: 'unavailable' };

function detail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function claudeCodeTarget(command: string, host: LaunchHost): Promise<TargetOutcome> {
  if (!host.hasExtension(CLAUDE_CODE_EXTENSION_ID)) {
    return UNAVAILABLE;
  }
  try {
    await host.activateExtension(CLAUDE_CODE_EXTENSION_ID);
    if (await host.commandExists(CLAUDE_CODE_OPEN_COMMAND)) {
      // `undefined` as the session id starts a new conversation with the prompt pre-filled.
      await host.executeCommand(CLAUDE_CODE_OPEN_COMMAND, undefined, command);
      return { kind: 'done', message: LAUNCH.statusClaudeCode };
    }
    host.log(format(LAUNCH.logClaudeCommandMissing, { command: CLAUDE_CODE_OPEN_COMMAND }));
  } catch (error) {
    host.log(format(LAUNCH.logClaudeCommandFailed, { detail: detail(error) }));
  }

  // A7 step 3 — `openExternal` cannot report "unhandled", so this ends the chain as success.
  const uri = `${host.uriScheme}://anthropic.claude-code/open?prompt=${encodeURIComponent(command)}`;
  await host.openExternal(uri);
  return { kind: 'done', message: LAUNCH.statusClaudeCodeUri };
}

function copilotCaveat(host: LaunchHost): void {
  if (host.wasCopilotNoticeShown()) {
    return;
  }
  void (async () => {
    try {
      await host.markCopilotNoticeShown();
      if (await host.notice(LAUNCH.copilotCaveat, LAUNCH.adjustLaunchOrder)) {
        await host.openSetting(TARGET_ORDER_SETTING);
      }
    } catch (error) {
      host.log(format(LAUNCH.logNoticeFailed, { detail: detail(error) }));
    }
  })();
}

async function copilotChatTarget(command: string, host: LaunchHost): Promise<TargetOutcome> {
  // A weak check: VS Code registers the chat command even when Copilot cannot answer, which
  // is exactly why the one-time caveat below exists.
  if (!host.hasExtension(COPILOT_CHAT_EXTENSION_ID)) {
    return UNAVAILABLE;
  }
  if (!(await host.commandExists(COPILOT_CHAT_OPEN_COMMAND))) {
    return UNAVAILABLE;
  }
  await host.executeCommand(COPILOT_CHAT_OPEN_COMMAND, {
    query: command,
    isPartialQuery: !host.autoSubmit()
  });
  copilotCaveat(host);
  return { kind: 'done', message: LAUNCH.statusCopilotChat };
}

/** § 7.5 steps 1–3; the picker's answer is remembered in `workspaceState`. */
async function chooseTerminal(host: LaunchHost): Promise<TerminalHandle | 'new' | null> {
  const open = host.openTerminals();
  const preferred = host.preferredTerminalName().trim();
  if (preferred !== '') {
    const named = open.find((terminal) => terminal.name === preferred);
    if (named !== undefined) {
      return named;
    }
  }
  const remembered = host.rememberedTerminalName();
  if (remembered !== undefined && remembered !== '') {
    const named = open.find((terminal) => terminal.name === remembered);
    if (named !== undefined) {
      return named;
    }
  }
  const claudeLike = open.filter((terminal) => /claude/i.test(terminal.name));
  if (claudeLike.length === 1) {
    return claudeLike[0];
  }

  const activeName = host.activeTerminalName();
  const ordered = [...open].sort((left, right) =>
    Number(right.name === activeName) - Number(left.name === activeName)
  );
  const items: PickItem<TerminalHandle | 'new'>[] = ordered.map((terminal) => ({
    label: terminal.name,
    description: terminal.name === activeName ? LAUNCH.terminalActive : undefined,
    value: terminal
  }));
  items.push({ label: LAUNCH.terminalNew, value: 'new' });
  return (await host.pick(items, LAUNCH.terminalPickPlaceholder)) ?? null;
}

async function terminalTarget(command: string, host: LaunchHost): Promise<TargetOutcome> {
  const chosen = await chooseTerminal(host);
  if (chosen === null) {
    return { kind: 'aborted' };
  }
  const submit = host.autoSubmit();
  if (chosen === 'new') {
    const terminal = host.createTerminal(NEW_TERMINAL_NAME);
    terminal.show();
    terminal.sendText(`claude ${quoteForShell(command, host.shell())}`, submit);
    await host.rememberTerminalName(terminal.name);
    return { kind: 'done', message: format(LAUNCH.statusTerminal, { name: terminal.name }) };
  }
  chosen.show();
  chosen.sendText(command, submit);
  await host.rememberTerminalName(chosen.name);
  return { kind: 'done', message: format(LAUNCH.statusTerminal, { name: chosen.name }) };
}

async function clipboardTarget(command: string, host: LaunchHost): Promise<TargetOutcome> {
  await host.copyToClipboard(command);
  return { kind: 'done', message: LAUNCH.statusClipboard };
}

function targetFor(target: LaunchTarget): (command: string, host: LaunchHost) => Promise<TargetOutcome> {
  switch (target) {
    case 'claudeCode':
      return claudeCodeTarget;
    case 'copilotChat':
      return copilotChatTarget;
    case 'terminal':
      return terminalTarget;
    case 'clipboard':
      return clipboardTarget;
  }
}

/**
 * Walks `targetOrder` and uses the first available target; a throwing target is logged and the
 * chain advances. The clipboard is the guaranteed floor, so a launch never fails silently.
 * Returns the target that took the command, or null when the user cancelled or nothing worked.
 */
export async function dispatch(command: string, host: LaunchHost): Promise<LaunchTarget | null> {
  const { order, warning } = normalizeTargetOrder(host.targetOrder());
  if (warning !== null) {
    host.log(warning);
  }

  for (const target of order) {
    try {
      const outcome = await targetFor(target)(command, host);
      if (outcome.kind === 'aborted') {
        return null;
      }
      if (outcome.kind === 'done') {
        host.statusMessage(outcome.message);
        return target;
      }
    } catch (error) {
      host.log(format(LAUNCH.logTargetFailed, { target, detail: detail(error) }));
    }
  }

  if (order.includes('clipboard')) {
    return null;
  }
  try {
    await clipboardTarget(command, host);
    host.statusMessage(LAUNCH.statusClipboard);
    return 'clipboard';
  } catch (error) {
    host.log(format(LAUNCH.logTargetFailed, { target: 'clipboard', detail: detail(error) }));
    return null;
  }
}

// --- the two flows (§ 7.2, § 7.3) -------------------------------------------

async function askDescription(host: LaunchHost, value: string): Promise<string | null> {
  const raw = await host.input({
    prompt: LAUNCH.descriptionPrompt,
    placeholder: LAUNCH.descriptionPlaceholder,
    value,
    validate: describeDescriptionError
  });
  if (raw === undefined) {
    return null;
  }
  const description = normalizeDescription(raw);
  return describeDescriptionError(description) === null ? description : null;
}

/** § 7.3 — choose a type, describe the task, dispatch to the first available target. */
export async function startWorkflow(host: LaunchHost): Promise<void> {
  if (!host.isTrusted()) {
    host.log(LAUNCH.logUntrusted);
    return;
  }
  const skill = await host.pick<WorkflowSkill>(
    WORKFLOW_SKILLS.map((value) => ({
      label: LAUNCH.workflowLabels[value],
      detail: LAUNCH.workflowDetails[value],
      value
    })),
    LAUNCH.workflowPickPlaceholder
  );
  if (skill === undefined) {
    return;
  }
  const description = await askDescription(host, '');
  if (description === null) {
    return;
  }
  await dispatch(startWorkflowCommand(skill, description), host);
}

export interface LaunchTask {
  readonly relPath: string;
  readonly title: string;
  readonly action: NextActionId;
}

/**
 * § 7.2 — the host recomputes the action from the index; no surface ever supplies command
 * text (A2). `only` narrows the research prompt when a dedicated command was invoked.
 */
export async function runNextAction(
  task: LaunchTask,
  host: LaunchHost,
  only?: 'design' | 'develop'
): Promise<void> {
  if (!host.isTrusted()) {
    host.log(LAUNCH.logUntrusted);
    return;
  }
  if (task.action === 'none') {
    host.statusMessage(LAUNCH.noNextAction);
    return;
  }

  if (task.action === 'fromResearch') {
    const kind =
      only ??
      (await host.pick<'design' | 'develop'>(
        [
          { label: LAUNCH.designFromResearch, value: 'design' },
          { label: LAUNCH.developFromResearch, value: 'develop' }
        ],
        LAUNCH.continueFromResearchPlaceholder
      ));
    if (kind === undefined) {
      return;
    }
    const description = await askDescription(host, task.title);
    if (description === null) {
      return;
    }
    const command = nextActionCommand({
      action: 'fromResearch',
      relPath: task.relPath,
      research: { kind, description }
    });
    if (command !== null) {
      await dispatch(command, host);
    }
    return;
  }

  const command = nextActionCommand({ action: task.action, relPath: task.relPath });
  if (command === null) {
    host.statusMessage(LAUNCH.noNextAction);
    return;
  }
  await dispatch(command, host);
}
