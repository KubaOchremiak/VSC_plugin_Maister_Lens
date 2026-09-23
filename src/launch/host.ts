import * as vscode from 'vscode';
import type { IndexLog, TaskIndex } from '../index/taskIndex.ts';
import { LAUNCH, format } from '../strings.ts';
import {
  type LaunchHost,
  type LaunchTask,
  type PickItem,
  type TerminalHandle,
  runNextAction,
  startWorkflow
} from './launch.ts';

const COPILOT_NOTICE_KEY = 'maisterLens.launch.copilotNoticeShown';
const TERMINAL_NAME_KEY = 'maisterLens.launch.lastTerminalName';
const STATUS_MESSAGE_MS = 5_000;

function configuration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('maisterLens');
}

function wrap(terminal: vscode.Terminal): TerminalHandle {
  return {
    name: terminal.name,
    show: () => terminal.show(false),
    sendText: (text, submit) => terminal.sendText(text, submit)
  };
}

export function createLaunchHost(context: vscode.ExtensionContext, log: IndexLog): LaunchHost {
  return {
    log,
    isTrusted: () => vscode.workspace.isTrusted,
    targetOrder: () => configuration().get('launch.targetOrder'),
    autoSubmit: () => configuration().get<boolean>('launch.autoSubmit') ?? false,
    preferredTerminalName: () => configuration().get<string>('launch.terminalName') ?? '',
    hasExtension: (id) => vscode.extensions.getExtension(id) !== undefined,
    activateExtension: async (id) => {
      await vscode.extensions.getExtension(id)?.activate();
    },
    commandExists: async (id) => (await vscode.commands.getCommands(true)).includes(id),
    executeCommand: async (id, ...args) => vscode.commands.executeCommand(id, ...args),
    uriScheme: vscode.env.uriScheme,
    openExternal: async (uri) => {
      await vscode.env.openExternal(vscode.Uri.parse(uri));
    },
    copyToClipboard: (text) => Promise.resolve(vscode.env.clipboard.writeText(text)),
    shell: () => vscode.env.shell,
    openTerminals: () => vscode.window.terminals.map(wrap),
    activeTerminalName: () => vscode.window.activeTerminal?.name,
    createTerminal: (name) => wrap(vscode.window.createTerminal({ name })),
    rememberedTerminalName: () => context.workspaceState.get<string>(TERMINAL_NAME_KEY),
    rememberTerminalName: async (name) => {
      await context.workspaceState.update(TERMINAL_NAME_KEY, name);
    },
    pick: async <T,>(items: PickItem<T>[], placeholder: string) => {
      const picked = await vscode.window.showQuickPick(
        items.map((item) => ({ ...item, label: item.label })),
        { placeHolder: placeholder, ignoreFocusOut: true }
      );
      return picked?.value;
    },
    input: async (options) =>
      vscode.window.showInputBox({
        prompt: options.prompt,
        placeHolder: options.placeholder,
        value: options.value,
        ignoreFocusOut: true,
        validateInput: (value) => options.validate(value)
      }),
    statusMessage: (text) => {
      vscode.window.setStatusBarMessage(text, STATUS_MESSAGE_MS);
    },
    notice: async (message, action) =>
      (await vscode.window.showInformationMessage(message, action)) === action,
    wasCopilotNoticeShown: () => context.globalState.get<boolean>(COPILOT_NOTICE_KEY) === true,
    markCopilotNoticeShown: async () => {
      await context.globalState.update(COPILOT_NOTICE_KEY, true);
    },
    openSetting: async (id) => {
      await vscode.commands.executeCommand('workbench.action.openSettings', id);
    }
  };
}

/**
 * Every launch command receives the A2 payload `{ folderUri }`; the action itself is
 * recomputed from the index here, so no surface can supply command text (§ 7.2, A2).
 */
function taskOf(index: TaskIndex, argument: unknown, log: IndexLog): LaunchTask | null {
  const folderUri =
    typeof argument === 'object' && argument !== null && 'folderUri' in argument
      ? (argument as { folderUri: unknown }).folderUri
      : undefined;
  if (typeof folderUri !== 'string') {
    log(format(LAUNCH.logTaskGone, { folderUri: String(folderUri) }));
    return null;
  }
  const task = index.snapshot.tasks.get(folderUri);
  if (task === undefined) {
    log(format(LAUNCH.logTaskGone, { folderUri }));
    return null;
  }
  return { relPath: task.ref.relPath, title: task.title, action: task.nextAction.id };
}

/** § 7.1's commands; the manifest gates their surfaces, and the host re-checks trust (A2.2). */
export function registerLaunchCommands(
  context: vscode.ExtensionContext,
  index: TaskIndex,
  log: IndexLog
): vscode.Disposable[] {
  const host = createLaunchHost(context, log);
  const run = async (argument: unknown, only?: 'design' | 'develop'): Promise<void> => {
    const task = taskOf(index, argument, log);
    if (task !== null) {
      await runNextAction(task, host, only);
    }
  };

  return [
    vscode.commands.registerCommand('maister.startWorkflow', () => startWorkflow(host)),
    vscode.commands.registerCommand('maister.runNextAction', (argument: unknown) => run(argument)),
    vscode.commands.registerCommand('maister.resumeTask', (argument: unknown) => run(argument)),
    vscode.commands.registerCommand('maister.startDevelopmentFromDesign', (argument: unknown) =>
      run(argument)
    ),
    vscode.commands.registerCommand('maister.designFromResearch', (argument: unknown) =>
      run(argument, 'design')
    ),
    vscode.commands.registerCommand('maister.developFromResearch', (argument: unknown) =>
      run(argument, 'develop')
    )
  ];
}
