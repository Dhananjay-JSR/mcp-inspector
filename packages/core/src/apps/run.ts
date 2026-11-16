import { Client } from "@modelcontextprotocol/client";
import type { ClientCapabilities, Transport } from "@modelcontextprotocol/client";
import { DEFAULT_CLIENT_INFO } from "../ports";
import { createRecording, recordedTransport } from "../recorder";
import type { Recording } from "../recorder";
import { APP_MIME_TYPE, UI_EXTENSION, appChecks, toolsFrom, uiTools } from "./checks";
import type { AppsCheckOptions, AppsCheckResult, CheckContext } from "./types";
import { computeVerdict } from "./verdict";

/** Capabilities that tell a server the host can render MCP App Views. */
export function uiClientCapabilities(enabled = true): ClientCapabilities {
  if (!enabled) {
    return {};
  }

  return {
    extensions: {
      [UI_EXTENSION]: { mimeTypes: [APP_MIME_TYPE] },
    },
  } as ClientCapabilities;
}

async function ignoreFailure<T>(task: Promise<T>): Promise<T | undefined> {
  try {
    return await task;
  } catch {
    return undefined;
  }
}

/**
 * Connect once, run the preflight sequence, and return the full wire
 * recording. Every request is best-effort: a failure is captured as an error
 * response in the recording, where the checks can see it.
 */
export async function recordSession(
  transport: Transport,
  options: AppsCheckOptions = {},
): Promise<Recording> {
  const recording = createRecording();
  const client = new Client(DEFAULT_CLIENT_INFO, {
    capabilities: uiClientCapabilities(options.uiCapability !== false),
    ...(options.versionNegotiation === "auto"
      ? { versionNegotiation: { mode: "auto" as const } }
      : {}),
  });

  try {
    await client.connect(recordedTransport(transport, recording));
    await ignoreFailure(client.listTools());

    for (const { ui } of uiTools(recording)) {
      await ignoreFailure(client.readResource({ uri: ui.uri as string }));
    }

    await ignoreFailure(client.ping());

    if (options.callTools) {
      for (const tool of toolsFrom(recording)) {
        const name = tool?.name;
        if (typeof name !== "string") {
          continue;
        }
        await ignoreFailure(
          client.callTool({ name, arguments: options.toolArguments?.[name] ?? {} }),
        );
      }
    }
  } finally {
    await ignoreFailure(client.close());
  }

  return recording;
}

export function analyze(recording: Recording, context: CheckContext = {}): AppsCheckResult {
  const findings = appChecks.flatMap((check) => check(recording, context));
  return { findings, verdict: computeVerdict(recording, findings) };
}

/** One handshake with the UI capability advertised. */
export async function runAppsCheck(
  transport: Transport,
  options: AppsCheckOptions = {},
): Promise<AppsCheckResult> {
  return analyze(await recordSession(transport, options));
}

/**
 * Two handshakes, with and without the UI capability, so APP008 can compare
 * what the server returns in each case.
 */
export async function runAppsCheckPair(
  createTransport: () => Transport,
  options: AppsCheckOptions = {},
): Promise<AppsCheckResult> {
  const withUi = await recordSession(createTransport(), {
    ...options,
    uiCapability: true,
  });
  const withoutUi = await recordSession(createTransport(), {
    ...options,
    uiCapability: false,
    callTools: false,
  });

  return analyze(withUi, { baselineTools: toolsFrom(withoutUi) });
}
