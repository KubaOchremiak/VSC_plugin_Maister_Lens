import type { LaunchHost, TerminalHandle } from '../../src/launch/launch.ts';

export interface FakeTerminal extends TerminalHandle {
  readonly sent: { text: string; submit: boolean }[];
  shown: number;
}

export function fakeTerminal(name: string): FakeTerminal {
  const terminal: FakeTerminal = {
    name,
    sent: [],
    shown: 0,
    show(): void {
      terminal.shown += 1;
    },
    sendText(text: string, submit: boolean): void {
      terminal.sent.push({ text, submit });
    }
  };
  return terminal;
}

export interface FakeHostState {
  readonly logs: string[];
  readonly executed: { id: string; args: unknown[] }[];
  readonly opened: string[];
  readonly copied: string[];
  readonly statuses: string[];
  readonly notices: { message: string; action: string }[];
  readonly settingsOpened: string[];
  readonly remembered: string[];
  readonly createdTerminals: FakeTerminal[];
  copilotNoticeShown: boolean;
}

export interface FakeHostOptions {
  order?: unknown;
  autoSubmit?: boolean;
  terminalName?: string;
  rememberedTerminal?: string;
  extensions?: string[];
  commands?: string[];
  terminals?: FakeTerminal[];
  activeTerminal?: string;
  shell?: string;
  uriScheme?: string;
  copilotNoticeShown?: boolean;
  pick?: LaunchHost['pick'];
  input?: LaunchHost['input'];
  execute?: (id: string, args: unknown[]) => Promise<unknown>;
  openExternal?: (uri: string) => Promise<void>;
  noticePressed?: boolean;
}

export function fakeHost(options: FakeHostOptions = {}): LaunchHost & FakeHostState {
  const state: FakeHostState = {
    logs: [],
    executed: [],
    opened: [],
    copied: [],
    statuses: [],
    notices: [],
    settingsOpened: [],
    remembered: [],
    createdTerminals: [],
    copilotNoticeShown: options.copilotNoticeShown ?? false
  };

  const host: LaunchHost & FakeHostState = {
    ...state,
    log: (line) => state.logs.push(line),
    isTrusted: () => true,
    targetOrder: () => options.order ?? ['claudeCode', 'copilotChat', 'terminal', 'clipboard'],
    autoSubmit: () => options.autoSubmit ?? false,
    preferredTerminalName: () => options.terminalName ?? '',
    hasExtension: (id) => (options.extensions ?? []).includes(id),
    activateExtension: async () => undefined,
    commandExists: async (id) => (options.commands ?? []).includes(id),
    executeCommand: async (id, ...args) => {
      state.executed.push({ id, args });
      return options.execute ? await options.execute(id, args) : undefined;
    },
    uriScheme: options.uriScheme ?? 'vscode',
    openExternal: async (uri) => {
      state.opened.push(uri);
      if (options.openExternal) {
        await options.openExternal(uri);
      }
    },
    copyToClipboard: async (text) => {
      state.copied.push(text);
    },
    shell: () => options.shell,
    openTerminals: () => options.terminals ?? [],
    activeTerminalName: () => options.activeTerminal,
    createTerminal: (name) => {
      const terminal = fakeTerminal(name);
      state.createdTerminals.push(terminal);
      return terminal;
    },
    rememberedTerminalName: () => options.rememberedTerminal,
    rememberTerminalName: async (name) => {
      state.remembered.push(name);
    },
    pick: options.pick ?? (async () => undefined),
    input: options.input ?? (async () => undefined),
    statusMessage: (text) => state.statuses.push(text),
    notice: async (message, action) => {
      state.notices.push({ message, action });
      return options.noticePressed ?? false;
    },
    wasCopilotNoticeShown: () => host.copilotNoticeShown,
    markCopilotNoticeShown: async () => {
      host.copilotNoticeShown = true;
    },
    openSetting: async (id) => {
      state.settingsOpened.push(id);
    }
  };
  return host;
}
