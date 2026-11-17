import type { Recording, TimelineEvent } from "../recorder";
import type { Finding } from "./types";

export interface CspViolation {
  blockedURI?: string;
  violatedDirective?: string;
  sourceFile?: string;
}

export interface RenderFacts {
  recording: Recording;
  /** Height the View reported through size-changed. */
  height: number;
  initialized: boolean;
  initializedNotification: boolean;
  /** Uncaught errors and failed module loads inside the View. */
  pageErrors: string[];
  consoleErrors: string[];
  cspViolations: CspViolation[];
  /** Host requests the View did not answer, for example `ping`. */
  unansweredRequests: string[];
  /** The tool that was rendered, with its declared visibility. */
  tool?: { name: string; visibility?: string[] };
  /** View `tools/call` results that failed or called a non-app tool. */
  toolCallFailures: string[];
  /** What the host advertised in ui/initialize. */
  hostCapabilities?: Record<string, Json>;
  /** Methods the View requested from the host. */
  viewRequests?: string[];
}

type Json = any;

function viewMessages(recording: Recording): TimelineEvent[] {
  return recording.events.filter((event) => event.channel === "view");
}

function initializeRequest(recording: Recording): Json | undefined {
  return viewMessages(recording)
    .filter((event) => event.dir === "in")
    .map((event) => event.msg as Json)
    .find((msg) => msg?.method === "ui/initialize");
}

function sizeChanges(recording: Recording): Json[] {
  return viewMessages(recording)
    .filter(
      (event) =>
        event.dir === "in" &&
        (event.msg as Json)?.method === "ui/notifications/size-changed",
    )
    .map((event) => event.msg as Json);
}

function finding(
  input: Omit<Finding, "evidence"> & { evidence?: TimelineEvent[] },
): Finding {
  return { ...input, evidence: input.evidence ?? [] };
}

export function viewChecks(facts: RenderFacts): Finding[] {
  const out: Finding[] = [];
  const events = viewMessages(facts.recording);

  if (!facts.initialized) {
    out.push(
      finding({
        id: "VIEW001",
        severity: "error",
        title: "View never sent ui/initialize",
        detail: facts.pageErrors[0]
          ? `The View script did not start: ${facts.pageErrors[0]}`
          : "No ui/initialize request arrived within 5 seconds; the View script probably did not start.",
        evidence: events,
        fix: "Check the View console for a script error and call ui/initialize on load.",
        spec: "apps.mdx#ui-initialize",
      }),
    );
  } else {
    const init = initializeRequest(facts.recording);
    const params = init?.params ?? {};
    const badVersion = typeof params.protocolVersion !== "string";
    if (!params.appInfo || !params.appCapabilities || badVersion) {
      out.push(
        finding({
          id: "VIEW002",
          severity: "error",
          title: "ui/initialize is missing required fields",
          detail: badVersion
            ? "protocolVersion must be a string."
            : "appInfo and appCapabilities are required.",
          evidence: init ? events : [],
          fix: "Send protocolVersion, appInfo and appCapabilities in ui/initialize.",
          spec: "apps.mdx#ui-initialize",
        }),
      );
    }
  }

  if (facts.initialized && !facts.initializedNotification) {
    out.push(
      finding({
        id: "VIEW003",
        severity: "error",
        title: "View never sent ui/notifications/initialized",
        detail: "The host keeps the View hidden until the initialized notification arrives.",
        evidence: events,
        fix: "Send ui/notifications/initialized after the ui/initialize response.",
        spec: "apps.mdx#ui-initialize",
      }),
    );
  }

  const sizes = sizeChanges(facts.recording);
  if (facts.initializedNotification && (sizes.length === 0 || facts.height <= 0)) {
    out.push(
      finding({
        id: "VIEW004",
        severity: "error",
        title: "View never reported a usable height",
        detail:
          sizes.length === 0
            ? "No ui/notifications/size-changed arrived, so the host has nothing to lay out."
            : `The last reported height was ${facts.height}px.`,
        evidence: events,
        fix: "Measure the document and send ui/notifications/size-changed after render.",
        spec: "apps.mdx#size-changed",
      }),
    );
  }

  if (sizes.length > 5) {
    out.push(
      finding({
        id: "VIEW005",
        severity: "warning",
        title: "View is sending size-changed repeatedly",
        detail: `${sizes.length} size-changed notifications arrived; this is usually a resize loop.`,
        evidence: events,
        fix: "Only notify when the measured height actually changes.",
        spec: "apps.mdx#size-changed",
      }),
    );
  }

  const errors = [...facts.pageErrors, ...facts.consoleErrors];
  if (errors.length > 0) {
    out.push(
      finding({
        id: "VIEW006",
        severity: "error",
        title: "View threw an uncaught error",
        detail: errors.slice(0, 3).join(" | "),
        evidence: events,
        fix: "Fix the script error shown in the View console.",
      }),
    );
  }

  if (facts.cspViolations.length > 0) {
    const first = facts.cspViolations[0];
    out.push(
      finding({
        id: "VIEW007",
        severity: "error",
        title: "View violated the content security policy",
        detail: `${first.violatedDirective ?? "CSP"} blocked ${first.blockedURI ?? "a resource"}.`,
        evidence: events,
        fix: "Declare the origin in _meta.ui.csp or inline the resource.",
        spec: "apps.mdx#content-security-policy",
      }),
    );
  }

  if (facts.hostCapabilities && facts.viewRequests) {
    const unsupported = facts.viewRequests.filter((method) => {
      const capability = method === "tools/call"
        ? facts.hostCapabilities?.tools?.call
        : method === "resources/read"
          ? facts.hostCapabilities?.resources?.read
          : method === "ui/message"
            ? facts.hostCapabilities?.message
            : method === "ui/update-model-context"
              ? facts.hostCapabilities?.updateModelContext
              : true;
      return capability === false || capability === undefined;
    });

    if (unsupported.length > 0) {
      out.push(
        finding({
          id: "VIEW008",
          severity: "warning",
          title: "View used a host capability the host did not advertise",
          detail: `The View sent ${[...new Set(unsupported)].join(", ")} without that capability in hostCapabilities.`,
          evidence: events,
          fix: "Check hostCapabilities before calling optional host features.",
          spec: "apps.mdx#host-capabilities",
        }),
      );
    }
  }

  if (facts.unansweredRequests.length > 0) {
    out.push(
      finding({
        id: "VIEW009",
        severity: "warning",
        title: "View did not answer a host request",
        detail: `No response to ${facts.unansweredRequests.join(", ")}.`,
        evidence: events,
        fix: "Answer host requests such as ping and ui/resource-teardown.",
        spec: "apps.mdx#host-requests",
      }),
    );
  }

  if (facts.toolCallFailures.length > 0) {
    out.push(
      finding({
        id: "VIEW010",
        severity: "error",
        title: "View tools/call failed",
        detail: facts.toolCallFailures.slice(0, 3).join(" | "),
        evidence: events,
        fix: "Return a successful result, or call a tool whose visibility includes \"app\".",
        spec: "apps.mdx#view-tools",
        ...(facts.tool ? { tool: facts.tool.name } : {}),
      }),
    );
  }

  return out;
}
