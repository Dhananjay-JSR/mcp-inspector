import type { Recording, TimelineEvent } from "../recorder";
import type { CheckContext, Finding } from "./types";

export const APP_MIME_TYPE = "text/html;profile=mcp-app";
export const UI_EXTENSION = "io.modelcontextprotocol/ui";

const UI_SCHEME = "ui://";
const CDN_HOSTS = [
  "esm.sh",
  "unpkg.com",
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
  "skypack.dev",
];

type Json = any;

interface Exchange {
  method: string;
  params: Json;
  request: TimelineEvent;
  response?: TimelineEvent;
  result?: Json;
  error?: Json;
}

function asObject(value: unknown): Record<string, Json> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : undefined;
}

function serverEvents(recording: Recording): TimelineEvent[] {
  return recording.events.filter((event) => event.channel === "server");
}

function exchanges(recording: Recording): Exchange[] {
  const pending = new Map<Json, { method: string; params: Json; event: TimelineEvent }>();
  const out: Exchange[] = [];

  for (const event of serverEvents(recording)) {
    const msg = event.msg as Json;
    if (!msg || typeof msg !== "object" || msg.id === undefined) {
      continue;
    }

    if (event.dir === "out" && typeof msg.method === "string") {
      pending.set(msg.id, { method: msg.method, params: msg.params, event });
      continue;
    }

    if (event.dir === "in" && ("result" in msg || "error" in msg)) {
      const request = pending.get(msg.id);
      if (request) {
        out.push({
          method: request.method,
          params: request.params,
          request: request.event,
          response: event,
          result: msg.result,
          error: msg.error,
        });
      }
    }
  }

  return out;
}

function firstResponse(recording: Recording, method: string): TimelineEvent | undefined {
  return exchanges(recording).find((exchange) => exchange.method === method)?.response;
}

function toolsListEvent(recording: Recording): TimelineEvent[] {
  const exchange = exchanges(recording).find((item) => item.method === "tools/list");
  return exchange ? [exchange.response ?? exchange.request] : [];
}

function toolsFrom(recording: Recording): Json[] {
  const tools: Json[] = [];
  for (const exchange of exchanges(recording)) {
    if (exchange.method !== "tools/list" || !exchange.result) {
      continue;
    }
    if (Array.isArray(exchange.result.tools)) {
      tools.push(...exchange.result.tools);
    }
  }
  return tools;
}

interface UiInfo {
  uri?: string;
  legacyOnly: boolean;
  csp?: Record<string, Json>;
  visibility?: Json;
}

function uiOf(tool: Json): UiInfo {
  const meta = asObject(tool?._meta);
  const ui = asObject(meta?.ui);
  const legacy = meta?.["ui/resourceUri"];
  const modern = typeof ui?.resourceUri === "string" ? ui.resourceUri : undefined;

  return {
    uri: modern ?? (typeof legacy === "string" ? legacy : undefined),
    legacyOnly: modern === undefined && typeof legacy === "string",
    csp: asObject(ui?.csp),
    visibility: ui?.visibility,
  };
}

function uiTools(recording: Recording): Array<{ tool: Json; ui: UiInfo }> {
  return toolsFrom(recording)
    .map((tool) => ({ tool, ui: uiOf(tool) }))
    .filter((entry) => typeof entry.ui.uri === "string");
}

function readsFor(recording: Recording, uri: string): Exchange[] {
  return exchanges(recording).filter(
    (exchange) => exchange.method === "resources/read" && asObject(exchange.params)?.uri === uri,
  );
}

function readContent(exchange?: Exchange): Json | undefined {
  const contents = exchange?.result?.contents;
  return Array.isArray(contents) ? contents[0] : undefined;
}

function callResults(recording: Recording): Array<{ exchange: Exchange; result: Json }> {
  return exchanges(recording)
    .filter((exchange) => exchange.method === "tools/call" && exchange.result)
    .map((exchange) => ({ exchange, result: exchange.result }));
}

function finding(input: Omit<Finding, "evidence"> & { evidence?: TimelineEvent[] }): Finding {
  return { ...input, evidence: input.evidence ?? [] };
}

function noUiDeclaration(recording: Recording): Finding[] {
  const tools = toolsFrom(recording);
  if (tools.length === 0 || uiTools(recording).length > 0) {
    return [];
  }

  return [
    finding({
      id: "APP001",
      severity: "error",
      title: "No tool declares a UI resource",
      detail: `${tools.length} tool(s) are listed, but none has _meta.ui.resourceUri or the legacy ui/resourceUri key.`,
      evidence: toolsListEvent(recording),
      fix: "Add _meta.ui.resourceUri to at least one tool and serve that ui:// resource.",
      spec: "apps.mdx#ui-resource",
    }),
  ];
}

function legacyOnly(recording: Recording): Finding[] {
  return uiTools(recording)
    .filter((entry) => entry.ui.legacyOnly)
    .map((entry) =>
      finding({
        id: "APP002",
        severity: "warning",
        title: "Only the legacy UI resource key is used",
        detail: `${entry.tool.name} declares ui/resourceUri but not _meta.ui.resourceUri; newer hosts read the nested key.`,
        evidence: toolsListEvent(recording),
        fix: "Send both keys, or switch to _meta.ui.resourceUri.",
        spec: "apps.mdx#ui-resource",
        tool: entry.tool.name,
        resourceUri: entry.ui.uri,
      }),
    );
}

function resourceMissing(recording: Recording): Finding[] {
  const out: Finding[] = [];

  for (const { tool, ui } of uiTools(recording)) {
    const uri = ui.uri as string;
    const reads = readsFor(recording, uri);
    const read = reads[0];
    const contents = read?.result?.contents;
    const content = readContent(read);
    const text = content?.text;

    let detail: string | undefined;
    if (!read) {
      detail = `resources/read was never called for ${uri}.`;
    } else if (read.error) {
      detail = `resources/read for ${uri} failed: ${read.error.message ?? "unknown error"}.`;
    } else if (!Array.isArray(contents) || contents.length === 0) {
      detail = `resources/read for ${uri} returned no item.`;
    } else if (contents.length > 1) {
      detail = `resources/read for ${uri} returned ${contents.length} items; hosts expect exactly one.`;
    } else if (typeof text !== "string" || text.trim() === "") {
      detail = `resources/read for ${uri} returned empty HTML.`;
    }

    if (detail) {
      out.push(
        finding({
          id: "APP003",
          severity: "error",
          title: "UI resource is missing or unreadable",
          detail,
          evidence: read?.response ? [read.response] : toolsListEvent(recording),
          fix: "Return exactly one content item with the View HTML from resources/read.",
          spec: "apps.mdx#ui-resource",
          tool: tool.name,
          resourceUri: uri,
        }),
      );
    }
  }

  return out;
}

function wrongMimeType(recording: Recording): Finding[] {
  const out: Finding[] = [];

  for (const { tool, ui } of uiTools(recording)) {
    for (const read of readsFor(recording, ui.uri as string)) {
      const content = readContent(read);
      if (!content || content.mimeType === APP_MIME_TYPE) {
        continue;
      }

      out.push(
        finding({
          id: "APP004",
          severity: "error",
          title: "UI resource served with the wrong MIME type",
          detail: `resources/read returned mimeType ${JSON.stringify(content.mimeType)}; hosts only render ${JSON.stringify(APP_MIME_TYPE)}.`,
          evidence: read.response ? [read.response] : [],
          fix: `Set mimeType to ${JSON.stringify(APP_MIME_TYPE)} in resources/list and resources/read.`,
          spec: "apps.mdx#ui-resource-format",
          tool: tool.name,
          resourceUri: ui.uri,
        }),
      );
      break;
    }
  }

  return out;
}

function badScheme(recording: Recording): Finding[] {
  return uiTools(recording)
    .filter((entry) => !(entry.ui.uri as string).startsWith(UI_SCHEME))
    .map((entry) =>
      finding({
        id: "APP005",
        severity: "error",
        title: "UI resource does not use the ui:// scheme",
        detail: `${entry.tool.name} points at ${entry.ui.uri}; MCP Apps resources use the ui:// scheme.`,
        evidence: toolsListEvent(recording),
        fix: `Serve the View from a ${UI_SCHEME} URI, for example ${UI_SCHEME}app/view.html.`,
        spec: "apps.mdx#ui-resource",
        tool: entry.tool.name,
        resourceUri: entry.ui.uri,
      }),
    );
}

function metaInStructuredContent(recording: Recording): Finding[] {
  const out: Finding[] = [];

  for (const { exchange, result } of callResults(recording)) {
    const structured = asObject(result.structuredContent);
    if (!structured || !Object.prototype.hasOwnProperty.call(structured, "_meta")) {
      continue;
    }

    const tool = asObject(exchange.params)?.name;
    out.push(
      finding({
        id: "APP006",
        severity: "error",
        title: "_meta ended up inside structuredContent",
        detail: `${tool} returned _meta as part of structuredContent, usually a dict-serialization bug.`,
        evidence: exchange.response ? [exchange.response] : [],
        fix: "Return _meta on the tool definition or result, not inside structuredContent.",
        spec: "apps.mdx#metadata",
        tool,
      }),
    );
  }

  return out;
}

function pingFailed(recording: Recording): Finding[] {
  const ping = exchanges(recording).find((exchange) => exchange.method === "ping");
  if (!ping?.error) {
    return [];
  }

  return [
    finding({
      id: "APP007",
      severity: "error",
      title: "ping returns an error",
      detail: `ping failed: ${ping.error.message ?? "unknown error"}.`,
      evidence: ping.response ? [ping.response] : [],
      fix: "Implement ping; hosts use it as a liveness check before rendering the View.",
      spec: "apps.mdx#ping",
    }),
  ];
}

function capabilityGap(recording: Recording, context: CheckContext): Finding[] {
  const baseline = context.baselineTools as Json[] | undefined;
  if (!Array.isArray(baseline)) {
    return [];
  }

  const withUi = toolsFrom(recording);
  const baselineByName = new Map(baseline.map((tool: Json) => [tool?.name, tool]));
  const out: Finding[] = [];

  for (const tool of withUi) {
    const base = baselineByName.get(tool?.name);
    if (!base) {
      out.push(
        finding({
          id: "APP008",
          severity: "warning",
          title: "UI tool only appears when the UI capability is advertised",
          detail: `${tool?.name} is missing from tools/list when the client does not advertise ${UI_EXTENSION}.`,
          evidence: toolsListEvent(recording),
          fix: "Return the tool regardless of the UI capability, or document that the server requires it.",
          spec: "apps.mdx#capabilities",
          tool: tool?.name,
        }),
      );
    } else if (JSON.stringify(base._meta) !== JSON.stringify(tool._meta)) {
      out.push(
        finding({
          id: "APP008",
          severity: "warning",
          title: "UI metadata changes with the advertised capability",
          detail: `${tool?.name} has different _meta when ${UI_EXTENSION} is not advertised.`,
          evidence: toolsListEvent(recording),
          fix: "Keep _meta stable; hosts may connect without the UI extension.",
          spec: "apps.mdx#capabilities",
          tool: tool?.name,
        }),
      );
    }
  }

  for (const base of baseline) {
    if (!withUi.some((tool: Json) => tool?.name === base?.name)) {
      out.push(
        finding({
          id: "APP008",
          severity: "warning",
          title: "Tool disappears when the UI capability is advertised",
          detail: `${base?.name} is listed without ${UI_EXTENSION} but missing when it is advertised.`,
          evidence: toolsListEvent(recording),
          fix: "Return the tool in both handshakes.",
          spec: "apps.mdx#capabilities",
          tool: base?.name,
        }),
      );
    }
  }

  return out;
}

function cdnScripts(recording: Recording): Finding[] {
  const out: Finding[] = [];

  for (const { tool, ui } of uiTools(recording)) {
    const read = readsFor(recording, ui.uri as string)[0];
    const html = readContent(read)?.text;
    if (typeof html !== "string") {
      continue;
    }

    const hosts = new Set<string>();
    for (const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      try {
        const host = new URL(match[1], "https://view.invalid").hostname;
        if (CDN_HOSTS.some((cdn) => host === cdn || host.endsWith(`.${cdn}`))) {
          hosts.add(host);
        }
      } catch {
        // Relative or malformed URLs are not CDN loads.
      }
    }

    if (hosts.size > 0) {
      out.push(
        finding({
          id: "APP009",
          severity: "warning",
          title: "View loads scripts from a CDN",
          detail: `${tool.name} loads ${[...hosts].join(", ")}; sandboxed hosts often block third-party scripts.`,
          evidence: read?.response ? [read.response] : [],
          fix: "Bundle the script into the View HTML or serve it from the same origin.",
          spec: "apps.mdx#content-security-policy",
          tool: tool.name,
          resourceUri: ui.uri,
        }),
      );
    }
  }

  return out;
}

function externalOrigins(html: string): string[] {
  const origins = new Set<string>();
  const attributes = /<(?:script|link|img|iframe|source)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi;
  const cssUrls = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

  for (const match of [...html.matchAll(attributes), ...html.matchAll(cssUrls)]) {
    try {
      const url = new URL(match[1], "https://view.invalid");
      if (url.protocol === "http:" || url.protocol === "https:") {
        origins.add(url.origin);
      }
    } catch {
      // Ignore malformed values.
    }
  }

  return [...origins];
}

function undeclaredOrigins(recording: Recording): Finding[] {
  const out: Finding[] = [];

  for (const { tool, ui } of uiTools(recording)) {
    const read = readsFor(recording, ui.uri as string)[0];
    const html = readContent(read)?.text;
    if (typeof html !== "string") {
      continue;
    }

    const csp = ui.csp ?? {};
    const declared = new Set<string>();
    for (const key of ["connectDomains", "resourceDomains", "frameDomains", "baseUriDomains"]) {
      const values = csp[key];
      if (Array.isArray(values)) {
        for (const value of values) {
          declared.add(String(value));
        }
      }
    }

    const missing = externalOrigins(html).filter((origin) => !declared.has(origin) && !declared.has("*"));
    if (missing.length === 0) {
      continue;
    }

    out.push(
      finding({
        id: "APP010",
        severity: "warning",
        title: "View references external origins not declared in _meta.ui.csp",
        detail: `${tool.name} loads ${missing.join(", ")} but _meta.ui.csp does not allow them.`,
        evidence: read?.response ? [read.response] : [],
        fix: "Declare each origin in _meta.ui.csp, or inline the asset.",
        spec: "apps.mdx#content-security-policy",
        tool: tool.name,
        resourceUri: ui.uri,
      }),
    );
  }

  return out;
}

function dottedNames(recording: Recording): Finding[] {
  return toolsFrom(recording)
    .filter((tool) => typeof tool?.name === "string" && tool.name.includes("."))
    .map((tool) =>
      finding({
        id: "APP011",
        severity: "warning",
        title: "Tool name contains a dot",
        detail: `${tool.name} includes a dot; some hosts drop the widget for names like this.`,
        evidence: toolsListEvent(recording),
        fix: "Rename the tool to use letters, digits, underscores or dashes.",
        tool: tool.name,
      }),
    );
}

function missingTextFallback(recording: Recording): Finding[] {
  const out: Finding[] = [];

  for (const { exchange, result } of callResults(recording)) {
    if (result.isError === true) {
      continue;
    }
    const content = Array.isArray(result.content) ? result.content : [];
    const hasText = content.some(
      (item: Json) => item?.type === "text" && typeof item.text === "string" && item.text.trim() !== "",
    );
    if (hasText) {
      continue;
    }

    const tool = asObject(exchange.params)?.name;
    out.push(
      finding({
        id: "APP012",
        severity: "warning",
        title: "Tool result has no text fallback",
        detail: `${tool} returned no text content, so a model that cannot render the View sees nothing.`,
        evidence: exchange.response ? [exchange.response] : [],
        fix: "Add a short text summary to content alongside structuredContent.",
        spec: "apps.mdx#tool-results",
        tool,
      }),
    );
  }

  return out;
}

function missingStructuredContent(recording: Recording): Finding[] {
  const out: Finding[] = [];

  for (const { exchange, result } of callResults(recording)) {
    if (result.isError === true || result.structuredContent !== undefined) {
      continue;
    }

    const tool = asObject(exchange.params)?.name;
    out.push(
      finding({
        id: "APP013",
        severity: "info",
        title: "Tool result has no structuredContent",
        detail: `${tool} only returns text, so the View has to parse prose.`,
        evidence: exchange.response ? [exchange.response] : [],
        fix: "Return structuredContent with the values the View needs.",
        spec: "apps.mdx#tool-results",
        tool,
      }),
    );
  }

  return out;
}

function invalidVisibility(recording: Recording): Finding[] {
  const out: Finding[] = [];
  const allowed = new Set(["app", "model"]);

  for (const { tool, ui } of uiTools(recording)) {
    if (ui.visibility === undefined) {
      continue;
    }
    const values = Array.isArray(ui.visibility) ? ui.visibility : [ui.visibility];
    const invalid = values.filter((value) => !allowed.has(value));
    if (values.length > 0 && invalid.length === 0) {
      continue;
    }

    out.push(
      finding({
        id: "APP014",
        severity: "warning",
        title: "Tool visibility has invalid values",
        detail: `${tool.name} declares ${JSON.stringify(ui.visibility)}; allowed values are "app" and "model".`,
        evidence: toolsListEvent(recording),
        fix: 'Use visibility: ["app"], ["model"], or ["app", "model"].',
        spec: "apps.mdx#visibility",
        tool: tool.name,
      }),
    );
  }

  return out;
}

function noDiscover(recording: Recording): Finding[] {
  const discover = exchanges(recording).find((exchange) => exchange.method === "server/discover");
  if (!discover?.error) {
    return [];
  }

  return [
    finding({
      id: "APP015",
      severity: "info",
      title: "Server does not support server/discover",
      detail: "The 2026-07-28 probe returned an error, so hosts fall back to the initialize handshake.",
      evidence: discover.response ? [discover.response] : [],
      fix: "Optional: implement server/discover to skip the fallback round trip.",
      spec: "protocol#server-discover",
    }),
  ];
}

export const appChecks: Array<(recording: Recording, context: CheckContext) => Finding[]> = [
  noUiDeclaration,
  legacyOnly,
  resourceMissing,
  wrongMimeType,
  badScheme,
  metaInStructuredContent,
  pingFailed,
  capabilityGap,
  cdnScripts,
  undeclaredOrigins,
  dottedNames,
  missingTextFallback,
  missingStructuredContent,
  invalidVisibility,
  noDiscover,
];

export { exchanges, toolsFrom, uiTools };
