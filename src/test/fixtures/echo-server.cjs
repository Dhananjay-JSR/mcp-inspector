#!/usr/bin/env node
// Zero-dependency stdio MCP server for the extension tests. It implements just
// enough JSON-RPC for initialize, tools/list and tools/call.
const { createInterface } = require("node:readline");

const TOOLS = [
	{
		name: "echo",
		description: "Echo a fixed string back to the caller",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: "fail",
		description: "Always throws so the client sees a tool error",
		inputSchema: { type: "object", properties: {} },
	},
];

function handle(method, params) {
	switch (method) {
		case "initialize":
			return {
				protocolVersion: params?.protocolVersion ?? "2025-06-18",
				capabilities: { tools: {} },
				serverInfo: { name: "fixture-echo", version: "1.0.0" },
			};
		case "tools/list":
			return { tools: TOOLS };
		case "tools/call":
			if (params?.name === "echo") {
				return { content: [{ type: "text", text: "echoed" }] };
			}
			if (params?.name === "fail") {
				return { isError: true, content: [{ type: "text", text: "fixture failure" }] };
			}
			throw new Error(`Unknown tool: ${params?.name}`);
		case "ping":
			return {};
		default:
			throw new Error(`Method not found: ${method}`);
	}
}

createInterface({ input: process.stdin }).on("line", (line) => {
	if (!line.trim()) {
		return;
	}

	const message = JSON.parse(line);
	if (message.id === undefined) {
		return;
	}

	let reply;
	try {
		reply = { jsonrpc: "2.0", id: message.id, result: handle(message.method, message.params) };
	} catch (error) {
		reply = {
			jsonrpc: "2.0",
			id: message.id,
			error: { code: -32603, message: "Internal error" },
		};
	}

	process.stdout.write(JSON.stringify(reply) + "\n");
});
