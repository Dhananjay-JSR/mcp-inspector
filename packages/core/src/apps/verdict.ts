import type { Recording } from "../recorder";
import type { Finding, Verdict } from "./types";

const STEP_FOR_ID: Record<string, string> = {
  APP001: "tools/list",
  APP002: "tools/list",
  APP003: "resources/read",
  APP004: "resources/read",
  APP005: "tools/list",
  APP006: "tools/call",
  APP007: "ping",
  APP008: "initialize",
  APP009: "resources/read",
  APP010: "resources/read",
  APP011: "tools/list",
  APP012: "tools/call",
  APP013: "tools/call",
  APP014: "tools/list",
  APP015: "server/discover",
  VIEW001: "ui/initialize",
  VIEW002: "ui/initialize",
  VIEW003: "ui/notifications/initialized",
  VIEW004: "size-changed",
  VIEW005: "size-changed",
  VIEW006: "view script",
  VIEW007: "csp",
  VIEW008: "hostCapabilities",
  VIEW009: "host request",
  VIEW010: "tools/call",
};

/**
 * The first expected step that failed or was missing. Derived from the first
 * error finding, so APP004 (a read that returned the wrong MIME type) stops at
 * `resources/read` and APP001 stops at `tools/list`.
 */
export function computeVerdict(_recording: Recording, findings: Finding[]): Verdict {
  const errors = findings.filter((finding) => finding.severity === "error");
  if (errors.length === 0) {
    return { ok: true, summary: "All MCP App checks passed." };
  }

  const step = STEP_FOR_ID[errors[0].id];
  return {
    ok: false,
    stoppedAt: step,
    summary: step ? `${step} failed: ${errors[0].title}.` : errors[0].title,
  };
}
