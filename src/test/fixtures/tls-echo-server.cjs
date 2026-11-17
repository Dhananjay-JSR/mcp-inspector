#!/usr/bin/env node
// HTTPS MCP server used by the TLS integration tests. It serves one `echo`
// tool over Streamable HTTP and prints the chosen port so the test can connect.
// The JSON-RPC handler is inline so the fixture has no dependency on the SDK.
const fs = require("node:fs");
const https = require("node:https");

function option(name) {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

function handle(method, params) {
	switch (method) {
		case "initialize":
			return {
				protocolVersion: params?.protocolVersion ?? "2025-06-18",
				capabilities: { tools: {} },
				serverInfo: { name: "tls-echo-server", version: "1.0.0" },
			};
		case "tools/list":
			return {
				tools: [
					{
						name: "echo",
						description: "Returns the text it was given",
						inputSchema: {
							type: "object",
							properties: { text: { type: "string" } },
							required: ["text"],
						},
					},
				],
			};
		case "tools/call":
			if (params?.name !== "echo") {
				throw new Error(`Unknown tool: ${params?.name}`);
			}
			return {
				content: [{ type: "text", text: String(params?.arguments?.text ?? "") }],
			};
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
			error: { code: -32603, message: "Internal error" },
		};
	}
}

const tls = {
	key: fs.readFileSync(option("key")),
	cert: fs.readFileSync(option("cert")),
};

if (option("ca")) {
	tls.ca = fs.readFileSync(option("ca"));
	tls.requestCert = true;
	tls.rejectUnauthorized = true;
}

const httpServer = https.createServer(tls, (request, response) => {
	if (request.method !== "POST") {
		// Stateless mode has no standalone SSE stream to resume.
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

httpServer.listen(0, "127.0.0.1", () => {
	process.stdout.write(`PORT=${httpServer.address().port}\n`);
});
