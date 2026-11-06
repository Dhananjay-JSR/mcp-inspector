import type { FailureKind } from "./errorHints";

export interface InputSchema {
  type: "object";
  properties?: unknown | null;
  [key: string]: unknown;
}

export interface Tool {
  name: string;
  description?: string;
  input_schema: InputSchema;
}

export type RemoteTransport = "sse" | "streamable-http";

export interface ConnectionResult {
  success: boolean;
  tools?: Tool[];
  error?: string;
  /** Raw transport error, shown behind a "Technical details" toggle. */
  details?: string;
  /** Set when a remote connection succeeded, so the UI can name the transport. */
  transport?: RemoteTransport;
  /** The server answered 401 and needs an OAuth sign-in. */
  authRequired?: boolean;
  corsLikely?: boolean;
  /** Classified failure, used to choose the error card actions. */
  kind?: FailureKind;
  /** Header-free reproduction command for a remote endpoint. */
  curl?: string;
}

export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
  details?: string;
  kind?: FailureKind;
}

export type HeadersMap = Record<string, string>;

export interface IMCPClient {
  connectToStdio(scriptPath: string, args?: string): Promise<ConnectionResult>;
  connectToSSE(serverUrl: string, headers?: HeadersMap): Promise<ConnectionResult>;
  connectToStreamableHTTP(serverUrl: string, headers?: HeadersMap): Promise<ConnectionResult>;
  connectToRemote(
    serverUrl: string,
    headers?: HeadersMap,
    relayBase?: string,
    onPhase?: (message: string) => void,
    authMode?: "oauth" | "static",
  ): Promise<ConnectionResult>;
  executeTool(toolName: string, toolArgs: Record<string, unknown>): Promise<ToolResult>;
  disconnect(): Promise<void>;
}
