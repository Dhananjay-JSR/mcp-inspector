import * as vscode from "vscode";
import { MCPClient } from "../../../transport/MCPTransport";

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

  // The web extension has no STDIO. Use the HTTP fixture started by
  // scripts/test-web.mjs and run the same live checks the panel runs.
  const client = new MCPClient();
  try {
    const connection = await client.connectToRemote(
      "http://127.0.0.1:3979/mcp",
      {},
      undefined,
      undefined,
      "static",
    );
    assert(connection.success, `HTTP fixture connection failed: ${connection.error}`);

    const check = await client.checkApps();
    assert(
      check.findings.length === 0,
      `unexpected findings: ${check.findings.map((finding) => finding.id).join(", ")}`,
    );

    const tool = await client.executeTool("roll_dice", { sides: 6 });
    assert(tool.success, `roll_dice failed: ${tool.error}`);

    const resource = await client.readResource("ui://dice/view.html");
    assert(resource.contents.length === 1, "the View resource was missing");
  } finally {
    await client.disconnect();
  }
}
