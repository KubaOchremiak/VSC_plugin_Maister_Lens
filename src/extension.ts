import * as vscode from 'vscode';
import { TaskIndex, type IndexLog } from './index/taskIndex.ts';
import { createTaskWatcher } from './index/watcher.ts';
import { registerLaunchCommands } from './launch/host.ts';
import { registerPanel } from './panel/panel.ts';
import { INDEX } from './strings.ts';
import { registerNavTree } from './views/navTree.ts';
import { registerNowTree } from './views/nowTree.ts';
import { registerOverviewView } from './views/overviewView.ts';

let index: TaskIndex | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(INDEX.outputChannel);
  const log: IndexLog = (line) => output.appendLine(`[${new Date().toISOString()}] ${line}`);

  const storageUri = context.storageUri ?? context.globalStorageUri;
  index = new TaskIndex({
    storageUri,
    log,
    notify: (message) => void vscode.window.showWarningMessage(message),
    attributionEnabled: () =>
      vscode.workspace.getConfiguration('maisterLens').get<boolean>('attribution.enabled') ?? true
  });

  const nav = registerNavTree();
  const now = registerNowTree(index);
  const overview = registerOverviewView(context, index, log);

  context.subscriptions.push(
    output,
    index,
    nav,
    now,
    ...overview.disposables,
    createTaskWatcher(context, index, log),
    ...registerPanel(context, index, log),
    ...registerLaunchCommands(context, index, log),
    vscode.commands.registerCommand('maister.refresh', () => index?.refresh())
  );

  void index.load();
}

export async function deactivate(): Promise<void> {
  // § 3.3 — a clean shutdown flushes the debounced index write rather than losing it.
  await index?.flush();
  index = undefined;
}
