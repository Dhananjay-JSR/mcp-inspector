import * as vscode from "vscode";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export async function run(): Promise<void> {
  assert(vscode.env.uiKind === vscode.UIKind.Web, "Expected the web extension host");

  const extension = vscode.extensions.getExtension("DhananjaySenday.mcp--inspector");
  assert(extension, "MCP Inspector extension was not found");

  await extension.activate();
  assert(extension.isActive, "MCP Inspector did not activate");

  const commands = await vscode.commands.getCommands(true);
  assert(
    commands.includes("mcp--inspector.createNewRequest"),
    "createNewRequest command was not registered",
  );

  // Exercise the panel constructor and the web-specific transport picker.
  await vscode.commands.executeCommand("mcp--inspector.createNewRequest");
}
