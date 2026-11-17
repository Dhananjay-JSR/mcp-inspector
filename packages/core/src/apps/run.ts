import { Client } from "@modelcontextprotocol/client";
import type { ClientCapabilities, Transport } from "@modelcontextprotocol/client";
import { DEFAULT_CLIENT_INFO } from "../ports";
import { createRecording, recordedTransport } from "../recorder";
import type { Recording } from "../recorder";
import type { Tool } from "../types";
import { APP_MIME_TYPE, UI_EXTENSION, appChecks, toolsFrom, uiTools } from "./checks";
import type {
  AppsCheckOptions,
  AppsCheckResult,
  CheckContext,
  ServerIdentity,
} from "./types";
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
export interface RecordedSession {
  recording: Recording;
  connectError?: string;
}

export async function recordSession(
  transport: Transport,
  options: AppsCheckOptions = {},
): Promise<RecordedSession> {
  const recording = createRecording();
  const client = new Client(DEFAULT_CLIENT_INFO, {
    capabilities: uiClientCapabilities(options.uiCapability !== false),
    ...(options.versionNegotiation === "auto"
      ? { versionNegotiation: { mode: "auto" as const } }
      : {}),
  });

  let connectError: string | undefined;

  try {
    await client.connect(recordedTransport(transport, recording, "server", options.onEvent));
  } catch (error) {
    connectError = error instanceof Error ? error.message : String(error);
  }

  if (connectError) {
    await ignoreFailure(client.close());
    return { recording, connectError };
  }

  try {
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

  return { recording };
}

export function serverIdentity(recording: Recording): ServerIdentity | undefined {
  for (const event of recording.events) {
    if (event.channel !== "server" || event.dir !== "in") {
      continue;
    }
    const result = (event.msg as { result?: { serverInfo?: ServerIdentity; protocolVersion?: string } })
      .result;
    if (result?.serverInfo) {
      return { ...result.serverInfo, protocolVersion: result.protocolVersion };
    }
  }
  return undefined;
}

/**
 * Run the preflight requests on a client that is already connected. The
 * transport must have been wrapped with `recordedTransport` at connect time.
 */
export async function checkLiveSession(
  client: Client,
  tools: Tool[],
  recording: Recording,
  options: AppsCheckOptions = {},
): Promise<AppsCheckResult> {
  const uris = new Set<string>();

  for (const tool of tools) {
    const meta = tool._meta as
      | { ui?: { resourceUri?: string }; "ui/resourceUri"?: string }
      | undefined;
    const uri = meta?.ui?.resourceUri ?? meta?.["ui/resourceUri"];
    if (typeof uri === "string") {
      uris.add(uri);
    }
  }

  for (const uri of uris) {
    await ignoreFailure(client.readResource({ uri }));
  }

  await ignoreFailure(client.ping());

  if (options.callTools) {
    for (const tool of tools) {
      await ignoreFailure(
        client.callTool({
          name: tool.name,
          arguments: options.toolArguments?.[tool.name] ?? {},
        }),
      );
    }
  }

  return analyze(recording);
}

export function analyze(
  recording: Recording,
  context: CheckContext = {},
  connectError?: string,
): AppsCheckResult {
  const findings = appChecks.flatMap((check) => check(recording, context));
  return {
    recording,
    server: serverIdentity(recording),
    findings,
    verdict: connectError
      ? { ok: false, summary: `Could not connect: ${connectError}` }
      : computeVerdict(recording, findings),
    connectError,
  };
}

/** One handshake with the UI capability advertised. */
export async function runAppsCheck(
  transport: Transport,
  options: AppsCheckOptions = {},
): Promise<AppsCheckResult> {
  const session = await recordSession(transport, options);
  return analyze(session.recording, {}, session.connectError);
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
  if (withUi.connectError) {
    return analyze(withUi.recording, {}, withUi.connectError);
  }

  const withoutUi = await recordSession(createTransport(), {
    ...options,
    uiCapability: false,
    callTools: false,
  });

  return analyze(withUi.recording, { baselineTools: toolsFrom(withoutUi.recording) });
}
