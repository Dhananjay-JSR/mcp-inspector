import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import * as vscode from "vscode";
import { describeFailure } from "./errorHints";
import { connectWithFallback } from "./remote";
import type {
  ConnectionResult,
  HeadersMap,
  IMCPClient,
  InputSchema,
  Tool,
  ToolResult,
} from "./types";

function requestOptions(
  headers?: HeadersMap,
): { requestInit: { headers: HeadersMap } } | undefined {
  return headers && Object.keys(headers).length > 0
    ? { requestInit: { headers } }
    : undefined;
}

function endpointOf(serverUrl: string): URL | null {
  try {
    return new URL(serverUrl);
  } catch {
    return null;
  }
}

export class MCPClient implements IMCPClient {
  private mcp: Client;
  private transport:
    | StdioClientTransport
    | SSEClientTransport
    | StreamableHTTPClientTransport
    | null = null;
  private tools: Tool[] = [];

  constructor() {
    this.mcp = new Client({ name: "mcp-debugger-vscode-extension", version: "1.0.0" });
  }

  async connectToStdio(scriptPath: string, args = ""): Promise<ConnectionResult> {
    try {
      const argsArray = args.trim() ? args.split(/\s+/) : [];
      this.transport = new StdioClientTransport({
        command: scriptPath,
        args: argsArray,
      });

      this.mcp.connect(this.transport);

      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as InputSchema,
      }));

      vscode.window.showInformationMessage(
        `Connected to MCP server via STDIO with ${this.tools.length} tools`,
      );
      return { success: true, tools: this.tools };
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to connect to MCP server via STDIO: ${
          error instanceof Error ? error.message : "Unknown error occurred"
        }`,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to connect to STDIO server",
      };
    }
  }

  async connectToSSE(serverUrl: string, headers?: HeadersMap): Promise<ConnectionResult> {
    try {
      if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
        throw new Error("Server URL must start with http:// or https://");
      }

      this.mcp = new Client({ name: "mcp-debugger-vscode-extension", version: "1.0.0" });
      this.transport = new SSEClientTransport(
        new URL(serverUrl),
        requestOptions(headers),
      );

      await this.mcp.connect(this.transport);

      const toolsResult = await this.mcp.listTools();
      console.log(toolsResult);
      this.tools = toolsResult.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as InputSchema,
      }));

      vscode.window.showInformationMessage(
        `Connected to MCP server via SSE with ${this.tools.length} tools`,
      );
      return { success: true, tools: this.tools };
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Unknown error occurred";
      const failure = describeFailure(raw, endpointOf(serverUrl));
      return { success: false, error: failure.message, details: failure.details };
    }
  }

  async connectToStreamableHTTP(
    serverUrl: string,
    headers?: HeadersMap,
  ): Promise<ConnectionResult> {
    try {
      if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
        throw new Error("Server URL must start with http:// or https://");
      }

      this.mcp = new Client({ name: "mcp-debugger-vscode-extension", version: "1.0.0" });
      this.transport = new StreamableHTTPClientTransport(
        new URL(serverUrl),
        requestOptions(headers),
      );

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
      const raw = error instanceof Error ? error.message : "Unknown error occurred";
      const failure = describeFailure(raw, endpointOf(serverUrl));
      return { success: false, error: failure.message, details: failure.details };
    }
  }

  async connectToRemote(
    serverUrl: string,
    headers?: HeadersMap,
    relayBase?: string,
  ): Promise<ConnectionResult> {
    const result = await connectWithFallback(serverUrl, { relayBase }, (transport, target) =>
      transport === "sse"
        ? this.connectToSSE(target, headers)
        : this.connectToStreamableHTTP(target, headers),
    );

    if (!result.success) {
      vscode.window.showErrorMessage(`Failed to connect to MCP server: ${result.error}`);
    }
    return result;
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
