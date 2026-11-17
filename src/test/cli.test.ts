import * as assert from "assert";
import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { chromium } from "playwright-core";

const repo = path.resolve(__dirname, "../..");
const cli = path.join(repo, "packages/cli/dist/cli.js");

function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
	return new Promise((resolve) => {
		execFile("node", [cli, ...args], { cwd: repo }, (error, stdout, stderr) => {
			const code =
				error && typeof (error as { code?: unknown }).code === "number"
					? ((error as { code: number }).code)
					: error
						? 1
						: 0;
			resolve({ code, stdout, stderr });
		});
	});
}

suite("CLI", () => {
	test("good-dice exits 0 with the documented envelope", async function () {
		this.timeout(30000);
		const result = await run(["apps", "check", "stdio:node fixtures/good-dice/server.mjs", "--json"]);

		assert.strictEqual(result.code, 0, result.stderr);
		const output = JSON.parse(result.stdout);
		assert.strictEqual(output.schema, "mcp-inspector/apps-check@1");
		assert.strictEqual(output.verdict.ok, true);
		assert.deepStrictEqual(output.findings, []);
	});

	test("an error finding exits 1", async function () {
		this.timeout(30000);
		const result = await run(["apps", "check", "stdio:node fixtures/wrong-mime/server.mjs", "--json"]);

		assert.strictEqual(result.code, 1, result.stderr);
		const output = JSON.parse(result.stdout);
		assert.strictEqual(output.verdict.stoppedAt, "resources/read");
		assert.deepStrictEqual(
			output.findings.map((finding: { id: string }) => finding.id),
			["APP004"],
		);
	});

	test("--call-tools reaches the result checks", async function () {
		this.timeout(30000);
		const result = await run([
			"apps",
			"check",
			"stdio:node fixtures/meta-in-structured/server.mjs",
			"--call-tools",
			"--json",
		]);

		assert.strictEqual(result.code, 1, result.stderr);
		const output = JSON.parse(result.stdout);
		assert.deepStrictEqual(
			output.findings.map((finding: { id: string }) => finding.id),
			["APP006"],
		);
	});

	test("an unreachable server exits 2", async function () {
		this.timeout(30000);
		const result = await run([
			"apps",
			"check",
			"stdio:node does-not-exist.mjs",
			"--json",
		]);

		assert.strictEqual(result.code, 2);
	});

	test("an unknown command exits 3", async function () {
		const result = await run(["nope"]);

		assert.strictEqual(result.code, 3);
	});

	test("--help --json describes the commands", async function () {
		const result = await run(["--help", "--json"]);

		assert.strictEqual(result.code, 0);
		const output = JSON.parse(result.stdout);
		assert.strictEqual(output.schema, "mcp-inspector/help@1");
		assert.ok(Array.isArray(output.commands));
	});

	test("schema documents a command output", async function () {
		const result = await run(["schema", "apps", "check"]);

		assert.strictEqual(result.code, 0);
		const output = JSON.parse(result.stdout);
		assert.strictEqual(output.schema, "mcp-inspector/apps-check@1");
	});

	test("tools list returns the fixture tools", async function () {
		this.timeout(30000);
		const result = await run(["tools", "list", "stdio:node fixtures/good-dice/server.mjs", "--json"]);

		assert.strictEqual(result.code, 0, result.stderr);
		const output = JSON.parse(result.stdout);
		assert.strictEqual(output.schema, "mcp-inspector/tools-list@1");
		assert.deepStrictEqual(output.tools.map((tool: { name: string }) => tool.name), ["roll_dice"]);
	});
});

let browserAvailable = false;

suiteSetup(async function () {
	this.timeout(30000);
	try {
		const browser = await chromium.launch({ headless: true });
		browserAvailable = true;
		await browser.close();
	} catch {
		browserAvailable = false;
	}
});

function outputDir(name: string): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), `mcp-inspector-${name}-`));
}

suite("CLI render", () => {
	test("renders good-dice and writes the screenshot", async function () {
		this.timeout(60000);
		if (!browserAvailable) {
			this.skip();
		}

		const out = outputDir("good");
		const result = await run([
			"apps",
			"render",
			"stdio:node fixtures/good-dice/server.mjs",
			"--out",
			out,
			"--json",
		]);

		assert.strictEqual(result.code, 0, result.stderr);
		const output = JSON.parse(result.stdout);
		assert.strictEqual(output.schema, "mcp-inspector/apps-render@1");
		assert.ok(output.height > 0, "the View should report a height");
		assert.deepStrictEqual(output.findings, []);
		assert.ok(fs.statSync(output.files.screenshot).size > 0);
		assert.ok(fs.existsSync(output.files.timeline));
		assert.ok(fs.existsSync(output.files.findings));
	});

	test("zero-height-view reports VIEW004", async function () {
		this.timeout(60000);
		if (!browserAvailable) {
			this.skip();
		}

		const out = outputDir("height");
		const result = await run([
			"apps",
			"render",
			"stdio:node fixtures/zero-height-view/server.mjs",
			"--out",
			out,
			"--json",
		]);

		assert.strictEqual(result.code, 1, result.stderr);
		const output = JSON.parse(result.stdout);
		assert.deepStrictEqual(
			output.findings.map((finding: { id: string }) => finding.id),
			["VIEW004"],
		);
	});

	test("no-initialized reports VIEW003", async function () {
		this.timeout(60000);
		if (!browserAvailable) {
			this.skip();
		}

		const out = outputDir("initialized");
		const result = await run([
			"apps",
			"render",
			"stdio:node fixtures/no-initialized/server.mjs",
			"--out",
			out,
			"--json",
		]);

		assert.strictEqual(result.code, 1, result.stderr);
		const output = JSON.parse(result.stdout);
		assert.ok(
			output.findings.some((finding: { id: string }) => finding.id === "VIEW003"),
			JSON.stringify(output.findings.map((finding: { id: string }) => finding.id)),
		);
	});

	test("blocked-script reports VIEW007", async function () {
		this.timeout(60000);
		if (!browserAvailable) {
			this.skip();
		}

		const out = outputDir("csp");
		const result = await run([
			"apps",
			"render",
			"stdio:node fixtures/blocked-script/server.mjs",
			"--out",
			out,
			"--json",
		]);

		assert.strictEqual(result.code, 1, result.stderr);
		const output = JSON.parse(result.stdout);
		assert.ok(
			output.findings.some((finding: { id: string }) => finding.id === "VIEW007"),
			JSON.stringify(output.findings.map((finding: { id: string }) => finding.id)),
		);
	});
});
