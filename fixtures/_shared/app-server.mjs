import { readFileSync, appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const DEFAULT_VIEW = new URL("../good-dice/view.html", import.meta.url);

function logLine(file, dir, msg) {
  if (!file) {
    return;
  }
  appendFileSync(
    file,
    `── ${dir} ${new Date().toISOString().slice(11, 23)}\n${JSON.stringify(msg, null, 2)}\n\n`,
  );
}

/**
 * A zero-dependency MCP App server over stdio. Each fixture calls `run()` with
 * the one thing it breaks; everything else stays identical.
 */
export function run(options = {}) {
  const {
    uiUri = "ui://dice/view.html",
    mime = "text/html;profile=mcp-app",
    viewPath = DEFAULT_VIEW,
    meta = { ui: { resourceUri: uiUri }, "ui/resourceUri": uiUri },
    ping = () => ({}),
    tools,
    log = process.env.FIXTURE_LOG,
  } = options;

  const toolMeta = meta === null ? undefined : meta;
  const send = (msg) => {
    logLine(log, "SERVER → HOST", msg);
    process.stdout.write(JSON.stringify(msg) + "\n");
  };

  const handlers = {
    initialize: (params) => ({
      protocolVersion: params?.protocolVersion ?? "2025-11-25",
      capabilities: { tools: {}, resources: {} },
      serverInfo: { name: options.name ?? "dice-demo", version: "1.0.0" },
    }),

    "tools/list": () => ({
      tools: tools ?? [
        {
          name: "roll_dice",
          description:
            "Roll a dice and show the result in an interactive UI.",
          inputSchema: {
            type: "object",
            properties: { sides: { type: "number", default: 6 } },
          },
          ...(toolMeta === undefined ? {} : { _meta: toolMeta }),
        },
      ],
    }),

    "resources/list": () => ({
      resources: [{ uri: uiUri, name: "Dice View", mimeType: mime }],
    }),

    "resources/read": () => ({
      contents: [
        {
          uri: uiUri,
          mimeType: mime,
          text: readFileSync(viewPath, "utf8"),
        },
      ],
    }),

    "tools/call": ({ arguments: args = {} } = {}) => {
      const sides = args.sides ?? 6;
      const value = 1 + Math.floor(Math.random() * sides);
      return {
        content: [{ type: "text", text: `Rolled a ${value} (d${sides})` }],
        structuredContent: { value, sides },
      };
    },

    ping,
  };

  createInterface({ input: process.stdin }).on("line", (line) => {
    if (!line.trim()) {
      return;
    }

    const msg = JSON.parse(line);
    logLine(log, "HOST → SERVER", msg);
    if (msg.id === undefined) {
      return;
    }

    const handler = handlers[msg.method];
    if (!handler) {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        error: { code: -32601, message: `Method not found: ${msg.method}` },
      });
      return;
    }

    try {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: handler(msg.params ?? {}),
      });
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        error: {
          code: -32603,
          message: String(error?.message ?? error),
        },
      });
    }
  });
}
