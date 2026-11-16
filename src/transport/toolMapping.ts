import type { InputSchema, Tool } from "@dhananjay-jsr/mcp-inspector-core";

/**
 * The SDK tool fields the inspector actually reads. Kept structural so the
 * mapping can be tested without a live `Client`.
 */
export interface SdkToolLike {
  name: string;
  description?: string;
  inputSchema: unknown;
  _meta?: unknown;
  annotations?: unknown;
  outputSchema?: unknown;
}

/**
 * Copies the fields MCP Apps depends on. The previous inline mapping dropped
 * `_meta`, which is where a tool declares its `ui://` resource.
 */
export function toTool(tool: SdkToolLike): Tool {
  const mapped: Tool = {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as InputSchema,
  };

  if (tool._meta !== undefined) {
    mapped._meta = tool._meta;
  }
  if (tool.annotations !== undefined) {
    mapped.annotations = tool.annotations;
  }
  if (tool.outputSchema !== undefined) {
    mapped.outputSchema = tool.outputSchema;
  }

  return mapped;
}
