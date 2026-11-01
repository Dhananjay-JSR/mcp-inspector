const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");

const server = new McpServer({ name: "fixture-echo", version: "1.0.0" });

server.registerTool(
	"echo",
	{ description: "Echo a fixed string back to the caller" },
	async () => ({ content: [{ type: "text", text: "echoed" }] }),
);

server.registerTool(
	"fail",
	{ description: "Always throws so the client sees a tool error" },
	async () => {
		throw new Error("fixture failure");
	},
);

server.connect(new StdioServerTransport());
