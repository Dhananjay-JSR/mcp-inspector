import { auth, UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { StreamableHTTPClientTransportOptions } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import * as vscode from "vscode";
import { OAuthCallbackServer, SecretStorageOAuthProvider, supportsOAuth } from "../auth/oauth";
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

  constructor(private readonly secrets?: vscode.SecretStorage) {
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

      return { success: true, tools: this.tools };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to connect to STDIO server",
      };
    }
  }

  async connectToSSE(
    serverUrl: string,
    headers?: HeadersMap,
    authProvider?: OAuthClientProvider,
  ): Promise<ConnectionResult> {
    try {
      if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
        throw new Error("Server URL must start with http:// or https://");
      }

      this.mcp = new Client({ name: "mcp-debugger-vscode-extension", version: "1.0.0" });
      const options: SSEClientTransportOptions = { ...(requestOptions(headers) ?? {}) };
      if (authProvider) {
        options.authProvider = authProvider;
      }
      this.transport = new SSEClientTransport(new URL(serverUrl), options);

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
      if (e instanceof UnauthorizedError) {
        return { success: false, authRequired: true, error: "This server requires sign-in." };
      }
      const raw = e instanceof Error ? e.message : "Unknown error occurred";
      const failure = describeFailure(raw, endpointOf(serverUrl));
      return { success: false, error: failure.message, details: failure.details };
    }
  }

  async connectToStreamableHTTP(
    serverUrl: string,
    headers?: HeadersMap,
    authProvider?: OAuthClientProvider,
  ): Promise<ConnectionResult> {
    try {
      if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
        throw new Error("Server URL must start with http:// or https://");
      }

      this.mcp = new Client({ name: "mcp-debugger-vscode-extension", version: "1.0.0" });
      const options: StreamableHTTPClientTransportOptions = { ...(requestOptions(headers) ?? {}) };
      if (authProvider) {
        options.authProvider = authProvider;
      }
      this.transport = new StreamableHTTPClientTransport(new URL(serverUrl), options);

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
      if (error instanceof UnauthorizedError) {
        return { success: false, authRequired: true, error: "This server requires sign-in." };
      }
      const raw = error instanceof Error ? error.message : "Unknown error occurred";
      const failure = describeFailure(raw, endpointOf(serverUrl));
      return { success: false, error: failure.message, details: failure.details };
    }
  }

  async connectToRemote(
    serverUrl: string,
    headers?: HeadersMap,
    relayBase?: string,
    onPhase?: (message: string) => void,
    authMode: "oauth" | "static" = "oauth",
  ): Promise<ConnectionResult> {
    const endpoint = endpointOf(serverUrl);
    const useOAuth = authMode !== "static" && !!this.secrets && supportsOAuth(serverUrl);
    const callback = useOAuth ? new OAuthCallbackServer() : null;
    const usingRelay = Boolean(relayBase);

    try {
      if (callback) {
        await callback.start();
      }

      const provider =
        useOAuth && endpoint && this.secrets
          ? new SecretStorageOAuthProvider(this.secrets, endpoint, callback as OAuthCallbackServer)
          : null;

      const attempt = (
        transport: "sse" | "streamable-http",
        target: string,
        requestHeaders: HeadersMap | undefined,
        authProvider?: OAuthClientProvider,
      ) =>
        transport === "sse"
          ? this.connectToSSE(target, requestHeaders, authProvider)
          : this.connectToStreamableHTTP(target, requestHeaders, authProvider);

      const result = await connectWithFallback(
        serverUrl,
        { relayBase },
        async (transport, target) => {
          const label = transport === "sse" ? "SSE" : "Streamable HTTP";
          onPhase?.(`Trying ${label}${usingRelay ? " through the relay" : ""}…`);

          const first = await attempt(
            transport,
            target,
            headers,
            usingRelay ? undefined : provider ?? undefined,
          );

          if (!first.authRequired || !provider || !callback) {
            return first;
          }

          try {
            if (usingRelay) {
              onPhase?.("Server requires sign-in. Opening your browser…");
              const redirect = await auth(provider, { serverUrl });
              if (redirect === "AUTHORIZED") {
                const tokens = await provider.tokens();
                if (!tokens?.access_token) {
                  throw new Error("Sign-in did not return an access token");
                }
                onPhase?.("Retrying with the access token…");
                return await attempt(transport, target, {
                  ...headers,
                  Authorization: `Bearer ${tokens.access_token}`,
                });
              }

              onPhase?.("Waiting for sign-in in your browser…");
              const code = await vscode.window.withProgress(
                {
                  location: vscode.ProgressLocation.Notification,
                  title: "Waiting for MCP sign-in in your browser",
                  cancellable: true,
                },
                (_progress, token) => callback.waitForCode(provider.stateValue, token),
              );

              onPhase?.("Exchanging authorization code…");
              await auth(provider, { serverUrl, authorizationCode: code });
              const tokens = await provider.tokens();
              if (!tokens?.access_token) {
                throw new Error("Sign-in did not return an access token");
              }

              onPhase?.("Retrying with the access token…");
              return await attempt(transport, target, {
                ...headers,
                Authorization: `Bearer ${tokens.access_token}`,
              });
            }

            onPhase?.("Waiting for sign-in in your browser…");
            const code = await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: "Waiting for MCP sign-in in your browser",
                cancellable: true,
              },
              (_progress, token) => callback.waitForCode(provider.stateValue, token),
            );
            onPhase?.("Exchanging authorization code…");
            await auth(provider, { serverUrl: target, authorizationCode: code });
            onPhase?.("Retrying the connection…");
            return await attempt(transport, target, headers, provider);
          } catch (error) {
            return {
              success: false,
              authRequired: true,
              error: error instanceof Error ? error.message : "Sign-in failed",
            };
          }
        },
      );

      return result;
    } finally {
      callback?.close();
    }
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
