import { preferredTransports, relayUrlFor } from "./endpoint";
import type { ConnectionResult, RemoteTransport } from "./types";

export interface RelayOptions {
  relayBase?: string;
}

type ConnectAttempt = (
  transport: RemoteTransport,
  targetUrl: string,
) => Promise<ConnectionResult>;

/**
 * Tries the transports a URL is likely to speak, in order, and stops at the
 * first success. A blocked browser request (CORS) aborts the loop because the
 * next transport would be blocked the same way.
 */
export async function connectWithFallback(
  serverUrl: string,
  options: RelayOptions,
  connect: ConnectAttempt,
): Promise<ConnectionResult> {
  let endpoint: URL | null = null;
  try {
    endpoint = new URL(serverUrl);
  } catch {
    endpoint = null;
  }

  const order = endpoint ? preferredTransports(endpoint) : (["streamable-http", "sse"] as const);
  const failures: string[] = [];
  let firstFailure: ConnectionResult | null = null;

  for (const transport of order) {
    const targetUrl = options.relayBase
      ? relayUrlFor(options.relayBase, transport, serverUrl)
      : serverUrl;

    const result = await connect(transport, targetUrl);

    if (result.success) {
      return { ...result, transport };
    }

    if (result.corsLikely) {
      return result;
    }

    firstFailure ??= result;
    failures.push(`${transport}: ${result.details ?? result.error ?? "unknown error"}`);
  }

  return {
    success: false,
    error: firstFailure?.error ?? "Could not connect to the server",
    details: failures.join("\n"),
    kind: firstFailure?.kind,
    curl: firstFailure?.curl,
    authRequired: firstFailure?.authRequired,
    corsLikely: firstFailure?.corsLikely,
  };
}
