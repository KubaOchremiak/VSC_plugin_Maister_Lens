import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import { NAV } from '../../src/strings.ts';
import { NavTreeProvider, type NavNode } from '../../src/views/navTree.ts';

describe('navTree/integration', () => {
  it('lists exactly one root row (FR1 AC2)', () => {
    const provider = new NavTreeProvider();
    const roots = provider.getChildren();

    assert.equal(roots.length, 1);
  });

  it('renders the row with the dashboard icon and no children affordance (FR1 AC3)', () => {
    const provider = new NavTreeProvider();
    const root = provider.getChildren()[0] as NavNode;
    const item = provider.getTreeItem(root);

    assert.equal(item.label, NAV.dashboard);
    assert.ok(item.iconPath instanceof vscode.ThemeIcon);
    assert.equal((item.iconPath as vscode.ThemeIcon).id, 'dashboard');
    assert.equal(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
  });

  it('runs the existing openDashboard command and names itself for a screen reader (FR1 AC3)', () => {
    const provider = new NavTreeProvider();
    const root = provider.getChildren()[0] as NavNode;
    const item = provider.getTreeItem(root);

    assert.equal(item.command?.command, 'maister.openDashboard');
    assert.equal(typeof item.accessibilityInformation?.label, 'string');
    assert.ok((item.accessibilityInformation?.label ?? '').length > 0);
  });

  it('has no children under the root or any other node (FR1 AC4)', () => {
    const provider = new NavTreeProvider();
    const root = provider.getChildren()[0] as NavNode;

    assert.deepEqual(provider.getChildren(root), []);
    assert.deepEqual(provider.getChildren({ kind: 'dashboard' }), []);
  });
});
