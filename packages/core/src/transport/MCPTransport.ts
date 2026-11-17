import {
  auth,
  Client,
  SSEClientTransport,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import type {
  OAuthClientProvider,
  SSEClientTransportOptions,
  StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { ReadResourceResult } from "@modelcontextprotocol/client";
import { checkLiveSession } from "../apps/run";
import type { AppsCheckOptions, AppsCheckResult } from "../apps/types";
import { createRecording, recordedTransport } from "../recorder";
import type { Recording } from "../recorder";
import { OAuthCallbackServer } from "../auth/oauth";
import { SecretStorageOAuthProvider, supportsOAuth } from "../auth/provider";
import { describeError, describeOAuthBootstrapFailure, isOAuthDiscoveryFailure } from "../errorHints";
import { DEFAULT_CLIENT_INFO, noopNotifier } from "../ports";
import { toTool } from "../toolMapping";
import { connectWithFallback } from "../remote";
import { createTlsFetch } from "./tls";
import type { TlsConfig, TlsFetch } from "./tls";
import type { ClientInfo, Notifier, SecretStore } from "../ports";
import type { ConnectionResult, HeadersMap, IMCPClient, Tool, ToolResult } from "../types";

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
  private tlsFetch?: TlsFetch;
  private recording: Recording = createRecording();

  constructor(
    private readonly secrets?: SecretStore,
    private readonly tls: TlsConfig = {},
    private readonly notifier: Notifier = noopNotifier,
    private readonly identity: ClientInfo = DEFAULT_CLIENT_INFO,
  ) {
    this.mcp = new Client(this.identity);
  }

  async connectToStdio(scriptPath: string, args = ""): Promise<ConnectionResult> {
    try {
      const argsArray = args.trim() ? args.split(/\s+/) : [];
      this.transport = new StdioClientTransport({
        command: scriptPath,
        args: argsArray,
      });

      this.recording = createRecording();
      await this.mcp.connect(recordedTransport(this.transport, this.recording));

      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map(toTool);

      return { success: true, tools: this.tools };
    } catch (error) {
      const failure = describeError(error, null);
      return {
        success: false,
        error: failure.message,
        details: failure.details,
        kind: failure.kind,
      };
    }
  }

  async connectToSSE(
    serverUrl: string,
    headers?: HeadersMap,
    authProvider?: OAuthClientProvider,
    tlsFetch?: TlsFetch,
  ): Promise<ConnectionResult> {
    try {
      if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
        throw new Error("Server URL must start with http:// or https://");
      }

      this.mcp = new Client(this.identity);
      const options: SSEClientTransportOptions = { ...(requestOptions(headers) ?? {}) };
      if (authProvider) {
        options.authProvider = authProvider;
      }
      if (tlsFetch) {
        options.fetch = tlsFetch;
      }
      this.transport = new SSEClientTransport(new URL(serverUrl), options);

      this.recording = createRecording();
      await this.mcp.connect(recordedTransport(this.transport, this.recording));

      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map(toTool);

      this.notifier.info(
        `Connected to MCP server via SSE with ${this.tools.length} tools`,
      );
      return { success: true, tools: this.tools };
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        return { success: false, authRequired: true, error: "This server requires sign-in.", kind: "auth" };
      }
      if (authProvider && isOAuthDiscoveryFailure(e)) {
        const failure = describeOAuthBootstrapFailure(e, endpointOf(serverUrl));
        return {
          success: false,
          error: failure.message,
          details: failure.details,
          kind: failure.kind,
          curl: failure.curl,
        };
      }
      const failure = describeError(e, endpointOf(serverUrl));
      return {
        success: false,
        error: failure.message,
        details: failure.details,
        kind: failure.kind,
        curl: failure.curl,
      };
    }
  }

  async connectToStreamableHTTP(
    serverUrl: string,
    headers?: HeadersMap,
    authProvider?: OAuthClientProvider,
    tlsFetch?: TlsFetch,
  ): Promise<ConnectionResult> {
    try {
      if (!serverUrl.startsWith("http://") && !serverUrl.startsWith("https://")) {
        throw new Error("Server URL must start with http:// or https://");
      }

      this.mcp = new Client(this.identity);
      const options: StreamableHTTPClientTransportOptions = { ...(requestOptions(headers) ?? {}) };
      if (authProvider) {
        options.authProvider = authProvider;
      }
      if (tlsFetch) {
        options.fetch = tlsFetch;
      }
      this.transport = new StreamableHTTPClientTransport(new URL(serverUrl), options);

      this.recording = createRecording();
      await this.mcp.connect(recordedTransport(this.transport, this.recording));

      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map(toTool);

      this.notifier.info(
        `Connected to MCP server via Streamable HTTP with ${this.tools.length} tools`,
      );
      return { success: true, tools: this.tools };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return { success: false, authRequired: true, error: "This server requires sign-in.", kind: "auth" };
      }
      if (authProvider && isOAuthDiscoveryFailure(error)) {
        const failure = describeOAuthBootstrapFailure(error, endpointOf(serverUrl));
        return {
          success: false,
          error: failure.message,
          details: failure.details,
          kind: failure.kind,
          curl: failure.curl,
        };
      }
      const failure = describeError(error, endpointOf(serverUrl));
      return {
        success: false,
        error: failure.message,
        details: failure.details,
        kind: failure.kind,
        curl: failure.curl,
      };
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
    await this.closeTlsFetch();
    try {
      this.tlsFetch = await createTlsFetch(this.tls);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "could not load TLS material";
      const failure = describeError(error, endpoint, { fallbackKind: "tls" });
      return {
        success: false,
        error: `TLS configuration error: ${raw}`,
        details: raw,
        kind: "tls",
        curl: failure.curl,
      };
    }
    const useOAuth = authMode !== "static" && !!this.secrets && supportsOAuth(serverUrl);
    const callback = useOAuth ? new OAuthCallbackServer() : null;
    const usingRelay = Boolean(relayBase);

    try {
      if (callback) {
        await callback.start();
      }

      const provider =
        useOAuth && endpoint && this.secrets
          ? new SecretStorageOAuthProvider(this.secrets, endpoint, callback as OAuthCallbackServer, this.notifier)
          : null;

      const attempt = (
        transport: "sse" | "streamable-http",
        target: string,
        requestHeaders: HeadersMap | undefined,
        authProvider?: OAuthClientProvider,
      ) =>
        transport === "sse"
          ? this.connectToSSE(target, requestHeaders, authProvider, this.tlsFetch)
          : this.connectToStreamableHTTP(target, requestHeaders, authProvider, this.tlsFetch);

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
              const redirect = await auth(provider, { serverUrl, fetchFn: this.tlsFetch });
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
              const code = await this.notifier.withProgress(
                "Waiting for MCP sign-in in your browser",
                (token) => callback.waitForCode(provider.stateValue, token),
              );

              onPhase?.("Exchanging authorization code…");
              await auth(provider, { serverUrl, authorizationCode: code, fetchFn: this.tlsFetch });
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
            const code = await this.notifier.withProgress(
              "Waiting for MCP sign-in in your browser",
              (token) => callback.waitForCode(provider.stateValue, token),
            );
            onPhase?.("Exchanging authorization code…");
            await auth(provider, { serverUrl: target, authorizationCode: code, fetchFn: this.tlsFetch });
            onPhase?.("Retrying the connection…");
            return await attempt(transport, target, headers, provider);
          } catch (error) {
            return {
              success: false,
              authRequired: true,
              error: error instanceof Error ? error.message : "Sign-in failed",
              kind: "auth",
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
      const failure = describeError(error, null, { fallbackKind: "tool" });
      return {
        success: false,
        error: failure.message,
        details: failure.details,
        kind: failure.kind,
      };
    }
  }

  async checkApps(options: AppsCheckOptions = {}): Promise<AppsCheckResult> {
    if (!this.transport) {
      return {
        recording: this.recording,
        findings: [],
        verdict: { ok: false, summary: "Not connected to any transport." },
        connectError: "Not connected to any transport.",
      };
    }

    return checkLiveSession(this.mcp, this.tools, this.recording, options);
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    return this.mcp.readResource({ uri });
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.mcp.close();
      this.transport = null;
      this.tools = [];
      this.recording = createRecording();
    }
    await this.closeTlsFetch();
  }

  private async closeTlsFetch(): Promise<void> {
    const tlsFetch = this.tlsFetch;
    this.tlsFetch = undefined;
    await tlsFetch?.close().catch(() => undefined);
  }
}
