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
}

export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface IMCPClient {
  connectToStdio(scriptPath: string, args?: string): Promise<ConnectionResult>;
  connectToSSE(serverUrl: string): Promise<ConnectionResult>;
  executeTool(toolName: string, toolArgs: Record<string, unknown>): Promise<ToolResult>;
  disconnect(): Promise<void>;
}
