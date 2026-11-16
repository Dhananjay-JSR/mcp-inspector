import {
  SSEClientTransport,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import type { Transport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { preferredTransports } from "@dhananjay-jsr/mcp-inspector-core";
import type { Recording } from "@dhananjay-jsr/mcp-inspector-core";
import { UsageError } from "./args";

export type RemoteKind = "streamable-http" | "sse";

export type ServerSpec =
  | { kind: "stdio"; command: string; args: string[] }
  | { kind: "http"; url: string; headers: Record<string, string> };

/**
 * `stdio:"node server.mjs"` or `https://host/mcp`. Headers come from repeatable
 * `--header` flags and `MCP_INSPECTOR_HEADER_<NAME>` environment variables.
 */
export function parseServerSpec(input: string | undefined, headers: string[]): ServerSpec {
  if (!input) {
    throw new UsageError("Missing <server>. Use stdio:\"<command>\" or an http(s) URL.");
  }

  const map = headersFrom(headers);

  if (input.startsWith("stdio:")) {
    const parts = splitCommand(input.slice("stdio:".length));
    if (parts.length === 0) {
      throw new UsageError('stdio: needs a command, for example stdio:"node server.mjs"');
    }
    return { kind: "stdio", command: parts[0], args: parts.slice(1) };
  }

  if (/^https?:\/\//i.test(input)) {
    return { kind: "http", url: input, headers: map };
  }

  throw new UsageError(
    `Unsupported server "${input}". Use stdio:"<command>" or an http(s) URL.`,
  );
}

function headersFrom(values: string[]): Record<string, string> {
  const headers: Record<string, string> = {};

  for (const [name, value] of Object.entries(process.env)) {
    const prefix = "MCP_INSPECTOR_HEADER_";
    if (name.startsWith(prefix) && value !== undefined) {
      const header = name.slice(prefix.length).toLowerCase().replace(/_/g, "-");
      headers[header] = value;
    }
  }

  for (const raw of values) {
    const colon = raw.indexOf(":");
    if (colon <= 0) {
      throw new UsageError(`Invalid --header "${raw}". Expected "Name: value".`);
    }
    headers[raw.slice(0, colon).trim()] = raw.slice(colon + 1).trim();
  }

  return headers;
}

/** Quote-aware split for `stdio:` commands. */
export function splitCommand(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else if (char === "\\" && quote === '"' && index + 1 < input.length) {
        current += input[++index];
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (quote) {
    throw new UsageError(`Unterminated quote in ${input}`);
  }
  if (current) {
    parts.push(current);
  }

  return parts;
}

export function createTransport(spec: ServerSpec, remote?: RemoteKind): Transport {
  if (spec.kind === "stdio") {
    return new StdioClientTransport({ command: spec.command, args: spec.args });
  }

  const url = new URL(spec.url);
  const requestInit = { headers: spec.headers };

  return remote === "sse"
    ? new SSEClientTransport(url, { requestInit })
    : new StreamableHTTPClientTransport(url, { requestInit });
}

/** Remote transports to try, in order. STDIO has exactly one. */
export function transportKinds(spec: ServerSpec): Array<RemoteKind | undefined> {
  return spec.kind === "stdio" ? [undefined] : preferredTransports(new URL(spec.url));
}

export function hasInitialize(recording: Recording): boolean {
  return recording.events.some((event) => {
    const msg = event.msg as { result?: { serverInfo?: unknown } };
    return event.dir === "in" && Boolean(msg.result?.serverInfo);
  });
}
