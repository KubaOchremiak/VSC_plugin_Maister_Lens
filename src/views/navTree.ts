import * as vscode from 'vscode';
import { NAV } from '../strings.ts';

export const NAV_VIEW_ID = 'maister.nav';

export interface NavNode {
  readonly kind: 'dashboard';
}

const DASHBOARD_NODE: NavNode = { kind: 'dashboard' };

/** A fixed navigation row: no index, no state, and nothing that ever changes. */
export class NavTreeProvider implements vscode.TreeDataProvider<NavNode> {
  getChildren(node?: NavNode): NavNode[] {
    return node === undefined ? [DASHBOARD_NODE] : [];
  }

  getTreeItem(_node: NavNode): vscode.TreeItem {
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
