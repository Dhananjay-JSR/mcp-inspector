import { auth, UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport, SseError } from "@modelcontextprotocol/sdk/client/sse.js";
import type { SSEClientTransportOptions } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { StreamableHTTPClientTransportOptions } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import * as vscode from "vscode";
import {
  SecretStorageOAuthProvider,
  supportsOAuth,
  WebOAuthCallback,
} from "../auth/oauth.web";
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

const STDIO_WEB_ERROR =
  "STDIO is not available in VS Code for the Web. Use the desktop app or Codespaces, or connect to a remote SSE server.";

function looksLikeNetworkError(error: unknown, message: string): boolean {
  return (
    error instanceof TypeError ||
    /failed to fetch|load failed|networkerror|network error/i.test(message)
  );
}

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

/**
 * A 401 can arrive as UnauthorizedError when the SDK handled the challenge, as a
 * transport error when no auth provider was attached (the relay case), or as a
 * plain message. All three mean "sign in to continue".
 */
function isUnauthorized(error: unknown): boolean {
  if (error instanceof UnauthorizedError) {
    return true;
  }
  if (error instanceof SseError && error.code === 401) {
    return true;
  }
  if (error instanceof StreamableHTTPError && error.code === 401) {
    return true;
  }
  return error instanceof Error && /\b401\b|unauthorized|invalid_token/i.test(error.message);
}

/**
 * Routes OAuth discovery, registration, and token requests through the relay.
 * Some authorization servers send CORS headers on preflight but omit them from
 * the real response, so the browser discards the response body. The relay owns
 * its response and can always attach CORS headers.
 */
function relayAuthFetch(relayBase: string): FetchLike {
  const base = relayBase.replace(/\/+$/, "");
  return (url, init) =>
    fetch(`${base}/auth?url=${encodeURIComponent(url.toString())}`, init);
}

export class MCPClient implements IMCPClient {
  private mcp: Client;
  private transport: SSEClientTransport | StreamableHTTPClientTransport | null = null;
  private tools: Tool[] = [];

  constructor(private readonly secrets?: vscode.SecretStorage) {
    this.mcp = new Client({ name: "mcp-debugger-vscode-extension", version: "1.0.0" });
  }

  async connectToStdio(_scriptPath: string, _args = ""): Promise<ConnectionResult> {
    return { success: false, error: STDIO_WEB_ERROR };
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
      if (isUnauthorized(error)) {
        return { success: false, authRequired: true, error: "This server requires sign-in." };
      }
      return this.failure(error, "SSE", serverUrl);
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
      const options: StreamableHTTPClientTransportOptions = {
        ...(requestOptions(headers) ?? {}),
      };
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
      if (isUnauthorized(error)) {
        return { success: false, authRequired: true, error: "This server requires sign-in." };
      }
      return this.failure(error, "Streamable HTTP", serverUrl);
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
    const callback = useOAuth ? new WebOAuthCallback(relayBase) : null;
    const usingRelay = Boolean(relayBase);

    try {
      if (callback) {
        await callback.start();
      }

      const provider =
        useOAuth && endpoint && this.secrets
          ? new SecretStorageOAuthProvider(this.secrets, endpoint, callback as WebOAuthCallback)
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

      // OAuth endpoints are relayed too: some authorization servers omit CORS
      // headers from the real response even though preflight succeeds.
      const authFetch = relayBase ? relayAuthFetch(relayBase) : undefined;

      const result = await connectWithFallback(
        serverUrl,
        { relayBase },
        async (transport, target) => {
          const label = transport === "sse" ? "SSE" : "Streamable HTTP";
          onPhase?.(`Trying ${label}${usingRelay ? " through the relay" : ""}…`);

          // When relaying, the transport talks to the relay URL but auth must be
          // orchestrated here against the upstream URL. Attaching the provider to
          // the transport would make its internal 401 handling look for OAuth
          // metadata at the relay origin, which does not host it.
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
              // 1. Discover and register against the upstream URL, then open the browser.
              onPhase?.("Server requires sign-in. Opening your browser…");
              const redirect = await auth(provider, { serverUrl, fetchFn: authFetch });
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

              // 2. Wait for the redirect to come back through the URI handler.
              onPhase?.("Waiting for sign-in in your browser…");
              const code = await vscode.window.withProgress(
                {
                  location: vscode.ProgressLocation.Notification,
                  title: "Waiting for MCP sign-in in your browser",
                  cancellable: true,
                },
                (_progress, token) => callback.waitForCode(provider.stateValue, token),
              );

              // 3. Exchange the code at the auth server, then retry the relay with
              //    the bearer token as a plain header. The relay forwards it.
              onPhase?.("Exchanging authorization code…");
              await auth(provider, { serverUrl, authorizationCode: code, fetchFn: authFetch });
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

            // Direct connection: the transport already opened the browser.
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

      if (!result.success) {
        vscode.window.showErrorMessage(`Failed to connect to MCP server: ${result.error}`);
      }
      return result;
    } finally {
      callback?.close();
    }
  }

  private failure(
    error: unknown,
    transportLabel: string,
    serverUrl: string,
  ): ConnectionResult {
    const raw = error instanceof Error ? error.message : "Unknown error occurred";
    const failure = describeFailure(
      raw,
      endpointOf(serverUrl),
      looksLikeNetworkError(error, raw),
    );

    return {
      success: false,
      error: failure.message,
      details: failure.details,
      corsLikely: failure.corsLikely,
    };
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
