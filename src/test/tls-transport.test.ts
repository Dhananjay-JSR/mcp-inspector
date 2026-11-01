import * as assert from "assert";
import { ChildProcess, spawn } from "child_process";
import * as path from "path";
import { MCPClient } from "../transport/MCPTransport";

const fixtures = path.resolve(__dirname, "../../src/test/fixtures");
const tlsFixtures = path.join(fixtures, "tls");
const fixture = (name: string) => path.join(tlsFixtures, name);
const serverScript = path.join(fixtures, "tls-echo-server.cjs");

interface TestServer {
	url: string;
	stop: () => Promise<void>;
}

function startTlsServer(options: { clientCertificate?: boolean } = {}): Promise<TestServer> {
	const args = [serverScript, "--cert", fixture("server.crt"), "--key", fixture("server.key")];
	if (options.clientCertificate) {
		args.push("--ca", fixture("ca.crt"));
	}

	const child: ChildProcess = spawn("node", args, { stdio: ["ignore", "pipe", "pipe"] });
	let stderr = "";
	child.stderr?.on("data", (chunk) => {
		stderr += String(chunk);
	});

	const stop = () =>
		new Promise<void>((resolve) => {
			if (child.exitCode !== null || child.killed) {
				resolve();
				return;
			}
			child.once("exit", () => resolve());
			child.kill();
		});

	return new Promise<TestServer>((resolve, reject) => {
		let stdout = "";
		const timer = setTimeout(() => {
			void stop();
			reject(new Error(`TLS fixture server did not start in time. stderr: ${stderr}`));
		}, 10000);

		child.stdout?.on("data", (chunk) => {
			stdout += String(chunk);
			const match = /PORT=(\d+)/.exec(stdout);
			if (!match) {
				return;
			}

			clearTimeout(timer);
			resolve({ url: `https://127.0.0.1:${match[1]}/mcp`, stop });
		});

		child.once("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.once("exit", (code) => {
			clearTimeout(timer);
			reject(new Error(`TLS fixture server exited with ${code}. stderr: ${stderr}`));
		});
	});
}

suite("TLS transport integration", () => {
	test("connects to a self-signed HTTPS server when its CA is configured", async function () {
		this.timeout(20000);

		const server = await startTlsServer();
		const client = new MCPClient(undefined, { caPath: fixture("ca.crt") });

		try {
			const result = await client.connectToRemote(server.url);

			assert.strictEqual(result.success, true, result.error);
			assert.deepStrictEqual(result.tools?.map((tool) => tool.name), ["echo"]);

			const echo = await client.executeTool("echo", { text: "hello over TLS" });
			assert.strictEqual(echo.success, true, echo.error);
		} finally {
			await client.disconnect();
			await server.stop();
		}
	});

	test("fails against a self-signed HTTPS server when no CA is configured", async function () {
		this.timeout(20000);

		const server = await startTlsServer();
		const client = new MCPClient(undefined, {});

		try {
			const result = await client.connectToRemote(server.url);

			assert.strictEqual(result.success, false, "a self-signed server must not connect by default");
		} finally {
			await client.disconnect();
			await server.stop();
		}
	});

	test("presents a client certificate to an HTTPS server that requires mTLS", async function () {
		this.timeout(20000);

		const server = await startTlsServer({ clientCertificate: true });
		const client = new MCPClient(undefined, {
			caPath: fixture("ca.crt"),
			certPath: fixture("client.crt"),
			keyPath: fixture("client.key"),
		});

		try {
			const result = await client.connectToRemote(server.url);

			assert.strictEqual(result.success, true, result.error);
			assert.deepStrictEqual(result.tools?.map((tool) => tool.name), ["echo"]);
		} finally {
			await client.disconnect();
			await server.stop();
		}
	});

	test("fails against an mTLS server when no client certificate is configured", async function () {
		this.timeout(20000);

		const server = await startTlsServer({ clientCertificate: true });
		const client = new MCPClient(undefined, { caPath: fixture("ca.crt") });

		try {
			const result = await client.connectToRemote(server.url);

			assert.strictEqual(result.success, false, "mTLS must require a client certificate");
		} finally {
			await client.disconnect();
			await server.stop();
		}
	});

	test("reports an incomplete TLS configuration instead of connecting", async () => {
		const client = new MCPClient(undefined, { certPath: fixture("client.crt") });

		const result = await client.connectToRemote("https://127.0.0.1:1/mcp");

		assert.strictEqual(result.success, false);
		assert.match(result.error ?? "", /client key/i);
	});

	test("reports an unreadable TLS file instead of connecting", async () => {
		const client = new MCPClient(undefined, { caPath: fixture("missing-ca.pem") });

		const result = await client.connectToRemote("https://127.0.0.1:1/mcp");

		assert.strictEqual(result.success, false);
		assert.match(result.error ?? "", /TLS configuration error/i);
	});
});
