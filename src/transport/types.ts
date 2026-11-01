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

export interface ConnectionResult {
  success: boolean;
  tools?: Tool[];
  error?: string;
  /** Raw transport error, shown behind a "Technical details" toggle. */
  details?: string;
  corsLikely?: boolean;
}

export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export type HeadersMap = Record<string, string>;

export interface IMCPClient {
  connectToStdio(scriptPath: string, args?: string): Promise<ConnectionResult>;
  connectToSSE(serverUrl: string, headers?: HeadersMap): Promise<ConnectionResult>;
  connectToStreamableHTTP(serverUrl: string, headers?: HeadersMap): Promise<ConnectionResult>;
  executeTool(toolName: string, toolArgs: Record<string, unknown>): Promise<ToolResult>;
  disconnect(): Promise<void>;
}
