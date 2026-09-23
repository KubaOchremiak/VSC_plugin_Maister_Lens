import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { OVERVIEW } from '../../src/strings.ts';

interface CommandContribution {
  readonly command: string;
  readonly title: string;
  readonly category?: string;
  readonly icon?: string;
}

interface ViewContribution {
  readonly id: string;
  readonly name: string;
  readonly type?: string;
}

interface MenuEntry {
  readonly command: string;
  readonly when?: string;
  readonly group?: string;
}

interface Manifest {
  readonly repository: { type: string; url: string };
  readonly bugs: { url: string };
  readonly homepage: string;
  readonly activationEvents: string[];
  readonly extensionKind: string[];
  readonly dependencies: Record<string, string>;
  readonly capabilities: {
    untrustedWorkspaces: { supported: string; description: string };
    virtualWorkspaces: boolean;
  };
  readonly contributes: {
    commands: CommandContribution[];
    menus: Record<string, MenuEntry[]>;
    views: Record<string, ViewContribution[]>;
    configuration: { properties: Record<string, Record<string, unknown>> };
  };
}

const manifest: Manifest = JSON.parse(
  readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
) as Manifest;

/** A4: commands that take a task argument and are unreachable from the palette. */
const TASK_ARGUMENT_COMMANDS = [
  'maister.openTask',
  'maister.openArtifact',
  'maister.openArtifactSource',
  'maister.revealInExplorer',
  'maister.runNextAction',
  'maister.resumeTask',
  'maister.startDevelopmentFromDesign',
  'maister.designFromResearch',
  'maister.developFromResearch',
];

/** A4: the exact set that stays visible in the Command Palette. */
const PALETTE_VISIBLE_COMMANDS = [
  'maister.openDashboard',
  'maister.openRisks',
  'maister.refresh',
  'maister.startWorkflow',
  'maister.overview.groupBy',
  'maister.overview.clearFilter',
  'maister.panel.back',
  'maister.panel.forward',
  'maister.panel.toggleVariant',
];

function commandPaletteEntry(command: string): MenuEntry | undefined {
  return manifest.contributes.menus.commandPalette.find((entry) => entry.command === command);
}

function viewTitleEntry(command: string, viewId: string): MenuEntry | undefined {
  return manifest.contributes.menus['view/title'].find(
    (entry) => entry.command === command && (entry.when ?? '').includes(`view == ${viewId}`)
  );
}

function commandIcon(command: string): string | undefined {
  return manifest.contributes.commands.find((entry) => entry.command === command)?.icon;
}

describe('manifest', () => {
  it('hides every task-argument command from the Command Palette (A4)', () => {
    for (const command of TASK_ARGUMENT_COMMANDS) {
      const entry = commandPaletteEntry(command);
      assert.ok(entry, `${command} has no commandPalette entry`);
      assert.equal(entry.when, 'false', `${command} is not hidden from the palette`);
    }
  });

  it('keeps exactly the nine palette-visible commands, startWorkflow trust-gated (A4)', () => {
    const declared = manifest.contributes.commands.map((entry) => entry.command);
    const hidden = manifest.contributes.menus.commandPalette
      .filter((entry) => entry.when === 'false')
      .map((entry) => entry.command);
    const visible = declared.filter((command) => !hidden.includes(command));

    assert.deepEqual([...visible].sort(), [...PALETTE_VISIBLE_COMMANDS].sort());
    assert.equal(commandPaletteEntry('maister.startWorkflow')?.when, 'isWorkspaceTrusted');
    for (const entry of manifest.contributes.commands) {
      assert.equal(entry.category, 'Maister', `${entry.command} lacks the Maister category`);
    }
  });

  it('contributes the Now and Overview title-bar actions (A15, A3)', () => {
    const startWorkflow = viewTitleEntry('maister.startWorkflow', 'maister.now');
    assert.equal(startWorkflow?.when, 'view == maister.now && isWorkspaceTrusted');
    assert.equal(startWorkflow?.group, 'navigation@1');
    assert.equal(commandIcon('maister.startWorkflow'), 'add');

    const refresh = viewTitleEntry('maister.refresh', 'maister.now');
    assert.equal(refresh?.when, 'view == maister.now');
    assert.equal(refresh?.group, 'navigation@2');
    assert.equal(commandIcon('maister.refresh'), 'refresh');

    const openRisks = viewTitleEntry('maister.openRisks', 'maister.overview');
    assert.equal(openRisks?.group, 'navigation@2');
    assert.equal(commandIcon('maister.openRisks'), 'warning');
    assert.ok(
      manifest.contributes.menus['editor/title'].some(
        (entry) =>
          entry.command === 'maister.openRisks' &&
          entry.when === "activeWebviewPanelId == 'maister.panel'"
      ),
      'maister.openRisks is missing from the panel editor title'
    );
  });

  it('lists the three sidebar views in manifest order, nav first (FR1 AC1, FR2 AC1)', () => {
    const views = manifest.contributes.views.maister;

    assert.deepEqual(
      views.map((view) => view.id),
      ['maister.nav', 'maister.now', 'maister.overview']
    );
    assert.equal(views[0].type, 'tree');
    assert.equal(views[0].name, 'Overview');
    assert.equal(views[2].name, 'Tasks');
  });

  it('keeps the maister.overview manifest name in step with OVERVIEW.title (FR2 AC2)', () => {
    const overview = manifest.contributes.views.maister.find((view) => view.id === 'maister.overview');

    assert.ok(overview, 'the maister.overview view is missing from the manifest');
    assert.equal(overview.name, OVERVIEW.title);
  });

  it('adds the nav view without declaring a new command (FR1 AC6)', () => {
    const declared = manifest.contributes.commands.map((entry) => entry.command);
    const hidden = manifest.contributes.menus.commandPalette
      .filter((entry) => entry.when === 'false')
      .map((entry) => entry.command);

    assert.equal(declared.filter((command) => !hidden.includes(command)).length, 9);
    assert.ok(declared.includes('maister.openDashboard'), 'the reused command is missing');
    assert.ok(!declared.some((command) => command.startsWith('maister.nav')));
  });

  it('declares trust, virtual-workspace, extension-kind and activation contracts', () => {
    assert.equal(manifest.capabilities.untrustedWorkspaces.supported, 'limited');
    assert.ok(manifest.capabilities.untrustedWorkspaces.description.length > 0);
    assert.equal(manifest.capabilities.virtualWorkspaces, false);
    assert.deepEqual(manifest.extensionKind, ['workspace']);
    for (const event of [
      'workspaceContains:.maister/tasks/*/*/orchestrator-state.yml',
      'workspaceContains:.maister/config.yml',
      'onWebviewPanel:maister.panel',
    ]) {
      assert.ok(manifest.activationEvents.includes(event), `missing activation event ${event}`);
    }
  });

  it('declares the five settings with their defaults and exactly two runtime deps', () => {
    const properties = manifest.contributes.configuration.properties;
    assert.deepEqual(Object.keys(properties).sort(), [
      'maisterLens.attribution.enabled',
      'maisterLens.launch.autoSubmit',
      'maisterLens.launch.targetOrder',
      'maisterLens.launch.terminalName',
      'maisterLens.staleness.quietDays',
    ]);
    assert.equal(properties['maisterLens.staleness.quietDays'].default, 3);
    assert.equal(properties['maisterLens.attribution.enabled'].default, true);
    assert.deepEqual(properties['maisterLens.launch.targetOrder'].default, [
      'claudeCode',
      'copilotChat',
      'terminal',
      'clipboard',
    ]);
    assert.deepEqual(
      (properties['maisterLens.launch.targetOrder'].items as { enum: string[] }).enum,
      ['claudeCode', 'copilotChat', 'terminal', 'clipboard']
    );
    assert.equal(properties['maisterLens.launch.autoSubmit'].default, false);
    assert.equal(properties['maisterLens.launch.terminalName'].default, '');

    assert.deepEqual(Object.keys(manifest.dependencies).sort(), ['markdown-it', 'yaml']);
  });
  it('carries the packaging metadata vsce needs, with no repo-relative link in CHANGELOG.md', () => {
    assert.match(manifest.repository.url, /^https:\/\/\S+$/, 'no repository URL to package with');
    assert.match(manifest.bugs.url, /^https:\/\//);
    assert.match(manifest.homepage, /^https:\/\//);

    const changelog = readFileSync(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8');
    const relative = [...changelog.matchAll(/\]\(([^)]+)\)/g)]
      .map((match) => match[1])
      .filter((link) => !/^(https?:|#)/.test(link));
    assert.deepEqual(relative, [], 'a relative link in CHANGELOG.md breaks in the Marketplace');
  });
});
