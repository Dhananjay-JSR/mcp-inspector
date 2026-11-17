import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const VIEW = new URL("../good-dice/view.html", import.meta.url);
const UI_URI = "ui://dice/view.html";
const MIME = "text/html;profile=mcp-app";

const portArg = process.argv.indexOf("--port");
const port = Number(
  portArg >= 0 ? process.argv[portArg + 1] : process.env.PORT || 3979,
);

const TOOL = {
  name: "roll_dice",
  description: "Roll a dice and show the result in an interactive UI.",
  inputSchema: {
    type: "object",
    properties: { sides: { type: "number", default: 6 } },
  },
  _meta: { ui: { resourceUri: UI_URI }, "ui/resourceUri": UI_URI },
};

function handle(method, params) {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: params?.protocolVersion ?? "2025-11-25",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "http-dice", version: "1.0.0" },
      };
    case "tools/list":
      return { tools: [TOOL] };
    case "resources/list":
      return { resources: [{ uri: UI_URI, name: "Dice View", mimeType: MIME }] };
    case "resources/read":
      return {
        contents: [
          {
            uri: UI_URI,
            mimeType: MIME,
            text: readFileSync(VIEW, "utf8"),
          },
        ],
      };
    case "tools/call": {
      const sides = params?.arguments?.sides ?? 6;
      const value = 1 + Math.floor(Math.random() * sides);
      return {
        content: [{ type: "text", text: `Rolled a ${value} (d${sides})` }],
        structuredContent: { value, sides },
      };
    }
    case "ping":
      return {};
    default:
      throw new Error(`Method not found: ${method}`);
  }
}

function reply(message) {
  try {
    return { jsonrpc: "2.0", id: message.id, result: handle(message.method, message.params) };
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32603, message: String(error?.message ?? error) },
    };
  }
}

const server = createServer((request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "*");
  response.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  if (!request.url?.startsWith("/mcp")) {
    response.writeHead(404).end();
    return;
  }

  if (request.method !== "POST") {
    // Stateless Streamable HTTP has no standalone SSE stream to resume.
    response.writeHead(405).end();
    return;
  }

  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    let message;
    try {
      message = body ? JSON.parse(body) : undefined;
    } catch {
      response.writeHead(400).end();
      return;
    }

    if (!message || message.id === undefined) {
      response.writeHead(202).end();
      return;
    }

    const text = JSON.stringify(reply(message));
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(text),
    });
    response.end(text);
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`LISTENING ${port}\n`);
});
