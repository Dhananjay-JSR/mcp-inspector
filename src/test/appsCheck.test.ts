import * as assert from "assert";
import * as path from "path";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import {
  runAppsCheck,
  runAppsCheckPair,
} from "@dhananjay-jsr/mcp-inspector-core";
import { MCPClient } from "../transport/MCPTransport";

const fixture = (name: string) =>
	path.resolve(__dirname, "../../fixtures", name, "server.mjs");

function check(name: string) {
	const transport = new StdioClientTransport({
		command: "node",
		args: [fixture(name)],
	});
	return runAppsCheck(transport, { callTools: true });
}

const ids = (result: { findings: Array<{ id: string }> }) =>
	result.findings.map((finding) => finding.id);

suite("MCP Apps preflight", () => {
	test("good-dice has no findings", async function () {
		this.timeout(20000);
		const result = await check("good-dice");

		assert.deepStrictEqual(ids(result), []);
		assert.strictEqual(result.verdict.ok, true);
	});

	test("wrong MIME type stops at resources/read", async function () {
		this.timeout(20000);
		const result = await check("wrong-mime");

		assert.deepStrictEqual(ids(result), ["APP004"]);
		assert.strictEqual(result.verdict.ok, false);
		assert.strictEqual(result.verdict.stoppedAt, "resources/read");
	});

	test("a missing UI declaration stops at tools/list", async function () {
		this.timeout(20000);
		const result = await check("no-ui-declaration");

		assert.deepStrictEqual(ids(result), ["APP001"]);
		assert.strictEqual(result.verdict.stoppedAt, "tools/list");
	});

	test("legacy-only metadata is a warning, not an error", async function () {
		this.timeout(20000);
		const result = await check("legacy-only");

		assert.deepStrictEqual(ids(result), ["APP002"]);
		assert.strictEqual(result.verdict.ok, true);
	});

	test("a non-ui URI is reported", async function () {
		this.timeout(20000);
		const result = await check("bad-uri");

		assert.deepStrictEqual(ids(result), ["APP005"]);
	});

	test("a failing ping is reported", async function () {
		this.timeout(20000);
		const result = await check("no-ping");

		assert.deepStrictEqual(ids(result), ["APP007"]);
	});

	test("_meta inside structuredContent is reported", async function () {
		this.timeout(20000);
		const result = await check("meta-in-structured");

		assert.deepStrictEqual(ids(result), ["APP006"]);
	});

	test("CDN scripts are reported", async function () {
		this.timeout(20000);
		const result = await check("cdn-script");

		assert.deepStrictEqual(ids(result), ["APP009"]);
	});

	test("undeclared external origins are reported", async function () {
		this.timeout(20000);
		const result = await check("external-origin");

		assert.deepStrictEqual(ids(result), ["APP010"]);
	});

	test("dotted tool names are reported", async function () {
		this.timeout(20000);
		const result = await check("dotted-name");

		assert.deepStrictEqual(ids(result), ["APP011"]);
	});

	test("a result without text is reported", async function () {
		this.timeout(20000);
		const result = await check("no-text-content");

		assert.deepStrictEqual(ids(result), ["APP012"]);
	});

	test("a result without structuredContent is reported", async function () {
		this.timeout(20000);
		const result = await check("no-structured-content");

		assert.deepStrictEqual(ids(result), ["APP013"]);
	});

	test("invalid visibility values are reported", async function () {
		this.timeout(20000);
		const result = await check("invalid-visibility");

		assert.deepStrictEqual(ids(result), ["APP014"]);
	});

	test("empty View HTML is reported", async function () {
		this.timeout(20000);
		const result = await check("empty-html");

		assert.deepStrictEqual(ids(result), ["APP003"]);
	});

	test("UI tools that need the capability are reported", async function () {
		this.timeout(25000);
		const result = await runAppsCheckPair(
			() =>
				new StdioClientTransport({
					command: "node",
					args: [fixture("no-ui-capability-gate")],
				}),
			{ callTools: true },
		);

		assert.deepStrictEqual(ids(result), ["APP008"]);
		assert.strictEqual(result.verdict.ok, true);
	});
});

suite("MCP Apps live session", () => {
	test("checkApps reuses the connected client and its recording", async function () {
		this.timeout(20000);
		const client = new MCPClient();

		try {
			const connection = await client.connectToStdio("node", fixture("wrong-mime"));
			assert.strictEqual(connection.success, true, connection.error);

			const result = await client.checkApps();
			assert.deepStrictEqual(
				result.findings.map((finding) => finding.id),
				["APP004"],
			);
		} finally {
			await client.disconnect();
		}
	});

	test("checkApps reports no findings for good-dice", async function () {
		this.timeout(20000);
		const client = new MCPClient();

		try {
			const connection = await client.connectToStdio("node", fixture("good-dice"));
			assert.strictEqual(connection.success, true, connection.error);

			const result = await client.checkApps();
			assert.deepStrictEqual(result.findings, []);
			assert.strictEqual(result.verdict.ok, true);
		} finally {
			await client.disconnect();
		}
	});
});
