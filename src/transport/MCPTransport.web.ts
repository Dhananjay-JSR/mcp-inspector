import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import * as vscode from "vscode";
import type {
  ConnectionResult,
  IMCPClient,
  InputSchema,
  Tool,
  ToolResult,
} from "./types";

const STDIO_WEB_ERROR =
  "STDIO is not available in VS Code for the Web. Use the desktop app or Codespaces, or connect to a remote SSE server.";

function looksLikeNetworkError(error: unknown, message: string): boolean {
  return (
    error instanceof TypeError ||
    /failed to fetch|load failed|networkerror|network error/i.test(message)
  );
}

export class MCPClient implements IMCPClient {
  private mcp: Client;
  private transport: SSEClientTransport | StreamableHTTPClientTransport | null = null;
  private tools: Tool[] = [];

  constructor() {
    this.mcp = new Client({ name: "mcp-debugger-vscode-extension", version: "1.0.0" });
  }

  async connectToStdio(_scriptPath: string, _args = ""): Promise<ConnectionResult> {
    return { success: false, error: STDIO_WEB_ERROR };
  }

  async connectToSSE(serverUrl: string): Promise<ConnectionResult> {
    try {
      if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
        throw new Error("Server URL must start with http:// or https://");
      }

      this.transport = new SSEClientTransport(new URL(serverUrl));
      await this.mcp.connect(this.transport);

      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as InputSchema,
      }));

      vscode.window.showInformationMessage(
        `Connected to MCP server via SSE with ${this.tools.length} tools`,
      );
      return { success: true, tools: this.tools };
    } catch (error) {
      return this.failure(error, "SSE");
    }
  }

  async connectToStreamableHTTP(serverUrl: string): Promise<ConnectionResult> {
    try {
      if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
        throw new Error("Server URL must start with http:// or https://");
      }

      this.transport = new StreamableHTTPClientTransport(new URL(serverUrl));
      await this.mcp.connect(this.transport);

      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as InputSchema,
      }));

      vscode.window.showInformationMessage(
        `Connected to MCP server via Streamable HTTP with ${this.tools.length} tools`,
      );
      return { success: true, tools: this.tools };
    } catch (error) {
      return this.failure(error, "Streamable HTTP");
    }
  }

  private failure(error: unknown, transportLabel: string): ConnectionResult {
    const message = error instanceof Error ? error.message : "Unknown error occurred";
    const networkError = looksLikeNetworkError(error, message);
    const hint = networkError
      ? " The browser blocked this cross-origin request. Allow this editor's origin on the server, or use the relay to connect."
      : "";
    const fullMessage = `${message}${hint}`;

    vscode.window.showErrorMessage(
      `Failed to connect to MCP server via ${transportLabel}: ${fullMessage}`,
    );
    return { success: false, error: fullMessage, corsLikely: networkError };
  }

  async executeTool(
    toolName: string,
    toolArgs: Record<string, unknown>,
  ): Promise<ToolResult> {
    if (!this.transport) {
      return { success: false, error: "Not connected to any transport" };
    }

    try {
      const result = await this.mcp.callTool({
        name: toolName,
        arguments: toolArgs,
      });
      return { success: true, result };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      vscode.window.showErrorMessage(`Failed to execute tool ${toolName}: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.mcp.close();
      this.transport = null;
      this.tools = [];
    }
  }
}
