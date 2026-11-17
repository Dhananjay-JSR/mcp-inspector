import { Client } from "@modelcontextprotocol/client";
import {
  DEFAULT_CLIENT_INFO,
  runAppsCheck,
  runAppsCheckPair,
  uiClientCapabilities,
} from "@dhananjay-jsr/mcp-inspector-core";
import type { AppsCheckResult, TimelineEvent } from "@dhananjay-jsr/mcp-inspector-core";
import {
  flagBool,
  flagStrings,
  parseArgs,
  UsageError,
} from "./args";
import type { FlagValue } from "./args";
import { bodyText, checkText, toolsText } from "./format";
import { render } from "./render";
import { resolve } from "node:path";
import {
  createTransport,
  hasInitialize,
  parseServerSpec,
  transportKinds,
} from "./server";
import type { RemoteKind, ServerSpec } from "./server";

export interface CliIO {
  stdout(line: string): void;
  stderr(line: string): void;
}

const defaultIO: CliIO = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
};

class ConnectError extends Error {}

const HELP = {
  schema: "mcp-inspector/help@1",
  name: "mcp-inspector",
  version: "1.0.0",
  description: "Check MCP Apps before a host tries to render them.",
  output:
    "JSON when stdout is not a TTY, pretty when it is. --json and --pretty override.",
  exitCodes: {
    "0": "no error findings",
    "1": "findings with severity error",
    "2": "could not connect",
    "3": "usage error",
  },
  commands: [
    {
      name: "apps check",
      usage:
        'mcp-inspector apps check <server> [--call-tools] [--discover] [--no-ui-capability] [--ndjson]',
      description:
        "Run APP001-APP015 against one server. Compares both UI-capability handshakes by default.",
    },
    {
      name: "apps render",
      usage:
        "mcp-inspector apps render <server> [--tool <name>] [--args <json>] [--out <dir>]",
      description:
        "Render a View in a headless browser, write a screenshot and run VIEW001-VIEW010.",
    },
    {
      name: "tools list",
      usage: "mcp-inspector tools list <server>",
      description: "List the tools a server exposes.",
    },
    {
      name: "tools call",
      usage: "mcp-inspector tools call <server> --tool <name> [--args <json>]",
      description: "Call one tool and print its result.",
    },
    {
      name: "resources read",
      usage: "mcp-inspector resources read <server> --uri <ui://…>",
      description: "Read one resource, usually a View document.",
    },
    {
      name: "schema",
      usage: "mcp-inspector schema [command]",
      description: "Print the JSON schema of a command's output.",
    },
  ],
  server:
    'A server is stdio:"<command>" or an http(s) URL. Headers use --header "Name: value" or MCP_INSPECTOR_HEADER_<NAME>.',
};

const FINDING_SCHEMA = {
  type: "object",
  required: ["id", "severity", "title", "detail", "evidence", "fix"],
  properties: {
    id: { type: "string" },
    severity: { enum: ["error", "warning", "info"] },
    title: { type: "string" },
    detail: { type: "string" },
    evidence: { type: "array", items: { type: "object" } },
    fix: { type: "string" },
    spec: { type: "string" },
    tool: { type: "string" },
    resourceUri: { type: "string" },
  },
};

const SCHEMAS: Record<string, unknown> = {
  "apps check": {
    schema: "mcp-inspector/apps-check@1",
    type: "object",
    required: ["schema", "verdict", "findings"],
    properties: {
      schema: { const: "mcp-inspector/apps-check@1" },
      server: {
        type: "object",
        properties: {
          name: { type: "string" },
          version: { type: "string" },
          protocolVersion: { type: "string" },
        },
      },
      verdict: {
        type: "object",
        required: ["ok", "summary"],
        properties: {
          ok: { type: "boolean" },
          stoppedAt: { type: "string" },
          summary: { type: "string" },
        },
      },
      findings: { type: "array", items: FINDING_SCHEMA },
    },
  },
  "apps render": {
    schema: "mcp-inspector/apps-render@1",
    type: "object",
    required: ["schema", "verdict", "findings", "files"],
    properties: {
      schema: { const: "mcp-inspector/apps-render@1" },
      server: { type: "object" },
      verdict: { type: "object" },
      findings: { type: "array", items: FINDING_SCHEMA },
      height: { type: "number" },
      files: {
        type: "object",
        required: ["screenshot", "timeline", "findings"],
        properties: {
          screenshot: { type: "string" },
          timeline: { type: "string" },
          findings: { type: "string" },
        },
      },
    },
  },
  "tools list": {
    schema: "mcp-inspector/tools-list@1",
    type: "object",
    required: ["schema", "tools"],
    properties: {
      schema: { const: "mcp-inspector/tools-list@1" },
      server: { type: "object" },
      tools: { type: "array", items: { type: "object" } },
    },
  },
  "tools call": {
    schema: "mcp-inspector/tools-call@1",
    type: "object",
    required: ["schema", "tool", "result"],
    properties: {
      schema: { const: "mcp-inspector/tools-call@1" },
      tool: { type: "string" },
      result: { type: "object" },
    },
  },
  "resources read": {
    schema: "mcp-inspector/resources-read@1",
    type: "object",
    required: ["schema", "uri", "contents"],
    properties: {
      schema: { const: "mcp-inspector/resources-read@1" },
      uri: { type: "string" },
      contents: { type: "array", items: { type: "object" } },
    },
  },
};

export async function main(argv: string[], io: CliIO = defaultIO): Promise<number> {
  try {
    return await dispatch(argv, io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(error.message);
      io.stderr("");
      io.stderr(helpText());
      return 3;
    }
    if (error instanceof ConnectError) {
      io.stderr(error.message);
      return 2;
    }
    io.stderr(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

async function dispatch(argv: string[], io: CliIO): Promise<number> {
  const { positionals, flags } = parseArgs(argv);

  if (flagBool(flags, "help") || positionals.length === 0) {
    printHelp(flags, io);
    return 0;
  }

  const [group, action, server] = positionals;

  if (group === "schema") {
    return schema(positionals.slice(1).join(" "), flags, io);
  }

  switch (`${group} ${action}`) {
    case "apps check":
      return appsCheck(server, flags, io);
    case "apps render":
      return appsRender(server, flags, io);
    case "tools list":
      return toolsList(server, flags, io);
    case "tools call":
      return toolsCall(server, flags, io);
    case "resources read":
      return resourcesRead(server, flags, io);
    default:
      throw new UsageError(`Unknown command: ${positionals.join(" ")}`);
  }
}

async function appsCheck(
  server: string | undefined,
  flags: Record<string, FlagValue>,
  io: CliIO,
): Promise<number> {
  const spec = parseServerSpec(server, flagStrings(flags, "header"));
  const onEvent = eventPrinter(flags, io);
  const options = {
    callTools: flagBool(flags, "call-tools"),
    versionNegotiation: (flagBool(flags, "discover") ? "auto" : "legacy") as
      | "auto"
      | "legacy",
    onEvent,
  };

  const single = flagBool(flags, "no-ui-capability");
  let result: AppsCheckResult | undefined;

  for (const kind of transportKinds(spec)) {
    result = single
      ? await runAppsCheck(createTransport(spec, kind), {
          ...options,
          uiCapability: false,
        })
      : await runAppsCheckPair(() => createTransport(spec, kind), options);
    if (!result.connectError) {
      break;
    }
  }

  if (!result) {
    throw new ConnectError(`Could not connect to ${server ?? "the server"}.`);
  }

  const code = result.connectError
    ? 2
    : result.findings.some((finding) => finding.severity === "error")
      ? 1
      : 0;

  print(
    io,
    flags,
    {
      schema: "mcp-inspector/apps-check@1",
      server: result.server ?? {},
      verdict: result.verdict,
      findings: result.findings,
    },
    checkText(result, "MCP Inspector: apps render"),
  );

  return code;
}

async function appsRender(
  server: string | undefined,
  flags: Record<string, FlagValue>,
  io: CliIO,
): Promise<number> {
  const spec = parseServerSpec(server, flagStrings(flags, "header"));
  const args = parseJsonObject(flagStringFlag(flags, "args") ?? "{}");
  const outDir = resolve(flagStringFlag(flags, "out") ?? "mcp-inspector-render");
  const tool = flagStringFlag(flags, "tool");

  const result = await render({ spec, tool, args, outDir });
  const code = result.findings.some((finding) => finding.severity === "error")
    ? 1
    : 0;

  const text = [
    checkText(result, "MCP Inspector: apps render"),
    "",
    `height: ${result.height}px`,
    "files:",
    `  screenshot: ${result.files.screenshot}`,
    `  timeline:   ${result.files.timeline}`,
    `  findings:   ${result.files.findings}`,
  ].join("\n");

  print(
    io,
    flags,
    {
      schema: "mcp-inspector/apps-render@1",
      server: result.server ?? {},
      verdict: result.verdict,
      findings: result.findings,
      height: result.height,
      files: result.files,
    },
    text,
  );

  return code;
}

async function toolsList(
  server: string | undefined,
  flags: Record<string, FlagValue>,
  io: CliIO,
): Promise<number> {
  const spec = parseServerSpec(server, flagStrings(flags, "header"));
  const { client, close } = await connectClient(spec);

  try {
    const { tools } = await client.listTools();
    print(
      io,
      flags,
      {
        schema: "mcp-inspector/tools-list@1",
        server: clientServer(client),
        tools,
      },
      toolsText(tools),
    );
    return 0;
  } finally {
    await close();
  }
}

async function toolsCall(
  server: string | undefined,
  flags: Record<string, FlagValue>,
  io: CliIO,
): Promise<number> {
  const spec = parseServerSpec(server, flagStrings(flags, "header"));
  const tool = flagStringFlag(flags, "tool");
  if (!tool) {
    throw new UsageError("Missing --tool <name>.");
  }

  const args = parseJsonObject(flagStringFlag(flags, "args") ?? "{}");
  const { client, close } = await connectClient(spec);

  try {
    const result = await client.callTool({ name: tool, arguments: args });
    const failed = (result as { isError?: boolean }).isError === true;
    print(
      io,
      flags,
      { schema: "mcp-inspector/tools-call@1", tool, result },
      bodyText(result),
    );
    return failed ? 1 : 0;
  } finally {
    await close();
  }
}

async function resourcesRead(
  server: string | undefined,
  flags: Record<string, FlagValue>,
  io: CliIO,
): Promise<number> {
  const spec = parseServerSpec(server, flagStrings(flags, "header"));
  const uri = flagStringFlag(flags, "uri");
  if (!uri) {
    throw new UsageError("Missing --uri <ui://…>.");
  }

  const { client, close } = await connectClient(spec);

  try {
    const result = await client.readResource({ uri });
    print(
      io,
      flags,
      {
        schema: "mcp-inspector/resources-read@1",
        uri,
        contents: result.contents,
      },
      bodyText(result.contents),
    );
    return 0;
  } finally {
    await close();
  }
}

function schema(
  name: string,
  flags: Record<string, FlagValue>,
  io: CliIO,
): number {
  if (!name) {
    print(io, flags, SCHEMAS, bodyText(SCHEMAS));
    return 0;
  }

  const value = SCHEMAS[name];
  if (!value) {
    throw new UsageError(
      `Unknown command "${name}". Try ${Object.keys(SCHEMAS).map((key) => `"${key}"`).join(", ")}.`,
    );
  }

  print(io, flags, value, bodyText(value));
  return 0;
}

async function connectClient(
  spec: ServerSpec,
): Promise<{ client: Client; close: () => Promise<void> }> {
  let lastError: unknown;

  for (const kind of transportKinds(spec)) {
    const client = new Client(DEFAULT_CLIENT_INFO, {
      capabilities: uiClientCapabilities(),
    });

    try {
      await client.connect(createTransport(spec, kind as RemoteKind | undefined));
      return {
        client,
        close: async () => {
          try {
            await client.close();
          } catch {
            // The process may already be gone.
          }
        },
      };
    } catch (error) {
      lastError = error;
      try {
        await client.close();
      } catch {
        // Ignore cleanup failures.
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new ConnectError(`Could not connect to ${describe(spec)}: ${message}`);
}

function describe(spec: ServerSpec): string {
  return spec.kind === "stdio" ? `${spec.command} ${spec.args.join(" ")}`.trim() : spec.url;
}

function clientServer(client: Client): {
  name?: string;
  version?: string;
  protocolVersion?: string;
} {
  const version = client.getServerVersion();
  return {
    name: version?.name,
    version: version?.version,
    protocolVersion: client.getNegotiatedProtocolVersion(),
  };
}

function eventPrinter(
  flags: Record<string, FlagValue>,
  io: CliIO,
): ((event: TimelineEvent) => void) | undefined {
  if (!flagBool(flags, "ndjson")) {
    return undefined;
  }
  return (event) => io.stdout(JSON.stringify(event));
}

function print(
  io: CliIO,
  flags: Record<string, FlagValue>,
  value: unknown,
  text: string,
): void {
  const json =
    flagBool(flags, "json") ||
    (!flagBool(flags, "pretty") && !process.stdout.isTTY);
  io.stdout(json ? JSON.stringify(value, null, 2) : text);
}

function printHelp(flags: Record<string, FlagValue>, io: CliIO): void {
  if (flagBool(flags, "json") || (!flagBool(flags, "pretty") && !process.stdout.isTTY)) {
    io.stdout(JSON.stringify(HELP, null, 2));
    return;
  }
  io.stdout(helpText());
}

function helpText(): string {
  const lines = [
    "mcp-inspector — check MCP Apps before a host tries to render them",
    "",
    "Usage:",
  ];
  for (const command of HELP.commands) {
    lines.push(`  ${command.usage}`, `      ${command.description}`, "");
  }
  lines.push(`Servers: ${HELP.server}`, "", `Output: ${HELP.output}`);
  lines.push(
    `Exit codes: ${Object.entries(HELP.exitCodes)
      .map(([code, text]) => `${code} ${text}`)
      .join("; ")}.`,
  );
  return lines.join("\n");
}

function flagStringFlag(
  flags: Record<string, FlagValue>,
  name: string,
): string | undefined {
  const value = flags[name];
  if (typeof value !== "string") {
    return undefined;
  }
  return value;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new UsageError(
      `--args is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UsageError("--args must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

export { hasInitialize };
