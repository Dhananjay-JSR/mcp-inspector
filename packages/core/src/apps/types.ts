import type { Recording, TimelineEvent } from "../recorder";

export type Severity = "error" | "warning" | "info";

export interface Finding {
  /** Stable check ID such as `APP003`. */
  id: string;
  severity: Severity;
  title: string;
  /** One sentence, plain English. */
  detail: string;
  /** The exact messages, or the call whose answer was missing. */
  evidence: TimelineEvent[];
  fix: string;
  spec?: string;
  tool?: string;
  resourceUri?: string;
}

export interface Verdict {
  ok: boolean;
  /** First expected step that failed or was missing. */
  stoppedAt?: string;
  summary: string;
}

export interface CheckContext {
  /**
   * Tools returned when the client did not advertise the UI extension. Lets
   * APP008 compare the two handshakes.
   */
  baselineTools?: unknown[];
}

export interface AppsCheckOptions {
  /** Advertise `io.modelcontextprotocol/ui` (default true). */
  uiCapability?: boolean;
  /** `auto` probes `server/discover` before `initialize`. */
  versionNegotiation?: "legacy" | "auto";
  /** Execute every tool after reading its resource (default false). */
  callTools?: boolean;
  /** Arguments per tool name; defaults to `{}`. */
  toolArguments?: Record<string, Record<string, unknown>>;
  /** Called for every recorded message, for `--ndjson` streaming. */
  onEvent?: (event: TimelineEvent) => void;
}

export interface ServerIdentity {
  name?: string;
  version?: string;
  protocolVersion?: string;
}

export interface AppsCheckResult {
  recording: Recording;
  server?: ServerIdentity;
  findings: Finding[];
  verdict: Verdict;
  /** Set when the transport could not be connected at all. */
  connectError?: string;
}
