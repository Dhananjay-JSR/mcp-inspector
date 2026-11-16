import * as vscode from "vscode";
import type { Notifier } from "@dhananjay-jsr/mcp-inspector-core";

/**
 * VS Code shell for the transport's UI port. The transport only knows
 * `info` / `withProgress` / `openExternal`; this is the adapter.
 */
export const vscodeNotifier: Notifier = {
  info(message) {
    void vscode.window.showInformationMessage(message);
  },

  withProgress(title, task) {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: true,
      },
      (_progress, token) => task(token),
    );
  },

  async openExternal(url) {
    await vscode.env.openExternal(vscode.Uri.parse(url));
  },
};
