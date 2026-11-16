import type { RemoteTransport } from "./types";

/** Paths that are unambiguously legacy SSE. Everything else prefers Streamable HTTP. */
export function preferredTransports(endpoint: URL): RemoteTransport[] {
  const path = endpoint.pathname.toLowerCase();
  const looksLikeSse =
    path.endsWith("/sse") || path.endsWith("/sse/") || path.includes("/sse/");

  return looksLikeSse ? ["sse", "streamable-http"] : ["streamable-http", "sse"];
}

export function relayUrlFor(
  relayBase: string,
  transport: RemoteTransport,
  upstream: string,
): string {
  const path = transport === "sse" ? "/sse" : "/mcp";
  return `${relayBase.replace(/\/+$/, "")}${path}?url=${encodeURIComponent(upstream)}`;
}

export function transportLabel(transport: RemoteTransport): string {
  return transport === "sse" ? "SSE" : "Streamable HTTP";
}
