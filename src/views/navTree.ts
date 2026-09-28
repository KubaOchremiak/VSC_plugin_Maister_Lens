import * as vscode from 'vscode';
import { NAV } from '../strings.ts';

export const NAV_VIEW_ID = 'maister.nav';

export interface NavNode {
  readonly kind: 'dashboard' | 'project';
}

const DASHBOARD_NODE: NavNode = { kind: 'dashboard' };
const PROJECT_NODE: NavNode = { kind: 'project' };

/** Fixed navigation rows: no index, no state, and nothing that ever changes. */
export class NavTreeProvider implements vscode.TreeDataProvider<NavNode> {
  getChildren(node?: NavNode): NavNode[] {
    return node === undefined ? [DASHBOARD_NODE, PROJECT_NODE] : [];
  }

  getTreeItem(node: NavNode): vscode.TreeItem {
    if (node.kind === 'project') {
      const item = new vscode.TreeItem(NAV.project, vscode.TreeItemCollapsibleState.None);
      item.id = 'nav:project';
      item.iconPath = new vscode.ThemeIcon('book');
      item.accessibilityInformation = { label: NAV.projectLabel };
      item.command = { command: 'maister.openProject', title: NAV.project };
      return item;
    }
    const item = new vscode.TreeItem(NAV.dashboard, vscode.TreeItemCollapsibleState.None);
    item.id = 'nav:dashboard';
    item.iconPath = new vscode.ThemeIcon('dashboard');
    item.accessibilityInformation = { label: NAV.dashboardLabel };
    item.command = { command: 'maister.openDashboard', title: NAV.dashboard };
    return item;
  }
}

/** Creates the view and returns it for disposal, mirroring `registerNowTree`. */
export function registerNavTree(): {
  provider: NavTreeProvider;
  view: vscode.TreeView<NavNode>;
  dispose(): void;
} {
  const provider = new NavTreeProvider();
  const view = vscode.window.createTreeView<NavNode>(NAV_VIEW_ID, {
    treeDataProvider: provider
  });

  return {
    provider,
    view,
    dispose: () => {
      view.dispose();
    }
  };
}
