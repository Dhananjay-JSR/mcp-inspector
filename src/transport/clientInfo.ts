import * as vscode from "vscode";
import type { ClientInfo } from "@dhananjay-jsr/mcp-inspector-core";

const EXTENSION_ID = "DhananjaySenday.mcp--inspector";

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
