import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { TaskIndex } from '../../src/index/taskIndex.ts';
import { FIXTURE_ROOT } from './fixtures.ts';

export const STATE_FILE = 'orchestrator-state.yml';

const temps: string[] = [];

/**
 * Realpath-resolved so the host's own /var → /private/var resolution on macOS cannot make
 * the folderUri the index reports differ from the one an assertion builds.
 */
export function makeTempDir(prefix: string): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `maister-lens-${prefix}-`)));
  temps.push(dir);
  return dir;
}

export function removeTempDirs(): void {
  for (const dir of temps.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function writeFile(fsPath: string, contents: string): void {
  fs.mkdirSync(path.dirname(fsPath), { recursive: true });
  fs.writeFileSync(fsPath, contents, 'utf8');
}

export function folderUriOf(dir: string): string {
  return vscode.Uri.file(dir).toString();
}

export interface TaskOptions {
  readonly title?: string;
  readonly status?: string;
  readonly completedPhases?: readonly string[];
  readonly currentPhase?: string;
  readonly artifacts?: readonly { readonly relPath: string; readonly label: string }[];
  readonly risks?: readonly string[];
  readonly decisions?: readonly string[];
}

export function taskState(options: TaskOptions = {}): string {
  const lines = [
    'task:',
    `  title: ${options.title ?? 'a task'}`,
    `  status: ${options.status ?? 'in_progress'}`,
    '  description: rotate the signing tokens',
    'orchestrator:',
    ...(options.currentPhase === undefined ? [] : [`  started_phase: ${options.currentPhase}`]),
    '  completed_phases:',
    ...(options.completedPhases ?? ['phase-1']).map((phase) => `    - ${phase}`),
    'task_context:',
    '  phase_summaries:',
    '    specification:',
    '      summary: wrote the spec'
  ];
  const decisions = options.decisions ?? ['Task identity is folderUri'];
  if (decisions.length > 0) {
    lines.push('      decisions:');
    for (const decision of decisions) {
      lines.push(`        - decision: ${decision}`, '          rationale: recorded at the gate');
    }
  }
  const risks = options.risks ?? [];
  if (risks.length > 0) {
    lines.push('      risks:');
    for (const risk of risks) {
      lines.push(`        - ${risk}`);
    }
  }
  const artifacts = options.artifacts ?? [];
  if (artifacts.length > 0) {
    lines.push('      artifacts:');
    for (const artifact of artifacts) {
      lines.push(`        - path: ${artifact.relPath}`, `          label: ${artifact.label}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** Writes a task folder and every artifact it registers, so the index can stat them. */
export function writeTask(
  workspace: string,
  dirSegment: string,
  name: string,
  options: TaskOptions = {}
): string {
  const dir = path.join(workspace, '.maister', 'tasks', dirSegment, name);
  writeFile(path.join(dir, STATE_FILE), taskState({ title: name, ...options }));
  for (const artifact of options.artifacts ?? []) {
    writeFile(path.join(dir, artifact.relPath), `# ${artifact.label}\n`);
  }
  return dir;
}

/**
 * A task folder carrying the committed vintage snapshot of Maister's own dashboard, so a
 * test can exercise the hosted path against the real asset rather than a stand-in.
 */
export function writeHostedTask(
  workspace: string,
  name: string,
  options: TaskOptions = {}
): string {
  const dir = writeTask(workspace, 'development', name, options);
  const fixture = path.join(FIXTURE_ROOT, 'pd-real');
  for (const file of ['dashboard.html', 'dashboard-data.js']) {
    fs.copyFileSync(path.join(fixture, file), path.join(dir, file));
  }
  return dir;
}

/** The workspace-folder shape `TaskIndex` and `TaskPanel` read, for temp directories. */
export function folderStubs(workspaces: readonly string[]): vscode.WorkspaceFolder[] {
  return workspaces.map((fsPath, order) => ({
    uri: vscode.Uri.file(fsPath),
    name: path.basename(fsPath),
    index: order
  }));
}

export interface IndexHarness {
  readonly index: TaskIndex;
  readonly log: string[];
  dispose(): void;
}

export function makeIndex(workspaces: readonly string[], storage: string): IndexHarness {
  const log: string[] = [];
  const index = new TaskIndex({
    storageUri: vscode.Uri.file(storage),
    log: (line) => log.push(line),
    notify: () => undefined,
    folders: () => folderStubs(workspaces),
    attributionEnabled: () => false
  });
  return { index, log, dispose: () => index.dispose() };
}

/**
 * A context stub carrying only what the views read: the extension root and workspace state.
 * The root is the repository itself, so a webview can resolve `media/` and `dist/webview/`
 * from both the unit run and the compiled integration run.
 */
export function stubContext(): vscode.ExtensionContext {
  const store = new Map<string, unknown>();
  return {
    extensionUri: vscode.Uri.file(process.cwd()),
    subscriptions: [],
    workspaceState: {
      keys: () => [...store.keys()],
      get: (key: string) => store.get(key),
      update: async (key: string, value: unknown) => {
        store.set(key, value);
      }
    },
    globalState: {
      keys: () => [],
      get: () => undefined,
      update: async () => undefined,
      setKeysForSync: () => undefined
    }
  } as unknown as vscode.ExtensionContext;
}

export async function waitFor(
  predicate: () => boolean,
  budgetMs: number,
  what: string
): Promise<number> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= budgetMs) {
    if (predicate()) {
      return Date.now() - startedAt;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${what} did not happen within ${budgetMs} ms`);
}

/**
 * Records the arguments a surface passes to one command without registering it: the extension
 * itself registers the launch commands (§ 7.1), so a second registration would throw.
 */
export function spyOnCommand(
  id: string
): { readonly calls: unknown[]; dispose: () => void } {
  const calls: unknown[] = [];
  const original = vscode.commands.executeCommand;
  const patched = async <T,>(command: string, ...args: unknown[]): Promise<T> => {
    if (command === id) {
      calls.push(args[0]);
      return undefined as T;
    }
    return original<T>(command, ...args);
  };
  (vscode.commands as { executeCommand: unknown }).executeCommand = patched;
  return {
    calls,
    dispose: () => {
      (vscode.commands as { executeCommand: unknown }).executeCommand = original;
    }
  };
}
