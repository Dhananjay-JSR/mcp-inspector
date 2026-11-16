import * as vscode from "vscode";

const EXTENSION_ID = "DhananjaySenday.mcp--inspector";

export interface ClientInfo {
  name: string;
  version: string;
}

/**
 * Identify the inspector to servers with the installed extension version, so
 * protocol traces do not all claim `1.0.0`.
 */
export function clientInfo(): ClientInfo {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  const version = (extension?.packageJSON as { version?: string } | undefined)
    ?.version;

  return { name: "mcp-inspector", version: version ?? "0.0.0" };
}
