#!/usr/bin/env node
// HTTPS MCP server used by the TLS integration tests. It serves one `echo`
// tool over Streamable HTTP and prints the chosen port so the test can connect.
const fs = require("node:fs");
const https = require("node:https");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");

function option(name) {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? process.argv[index + 1] : undefined;
}

function createMcpServer() {
	const server = new McpServer({ name: "tls-echo-server", version: "1.0.0" });
	server.tool("echo", "Returns the text it was given", { text: z.string() }, async ({ text }) => ({
		content: [{ type: "text", text }],
	}));
	return server;
}

async function readBody(request) {
	let body = "";
	for await (const chunk of request) {
		body += chunk;
	}
	return body ? JSON.parse(body) : undefined;
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
	(async () => {
		if (request.method !== "POST") {
			// Stateless mode has no standalone SSE stream to resume.
			response.writeHead(405).end();
			return;
		}

		const parsedBody = await readBody(request);
		const server = createMcpServer();
		const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

		response.on("close", () => {
			void transport.close();
			void server.close();
		});

		await server.connect(transport);
		await transport.handleRequest(request, response, parsedBody);
	})().catch((error) => {
		process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
		if (!response.headersSent) {
			response.writeHead(500);
		}
		response.end();
	});
});

httpServer.listen(0, "127.0.0.1", () => {
	process.stdout.write(`PORT=${httpServer.address().port}\n`);
});
