import * as assert from "assert";
import * as fs from "fs";
import * as https from "https";
import type { AddressInfo } from "net";
import * as path from "path";
import { createTlsFetch } from "../transport/tls";

const fixtures = path.resolve(__dirname, "../../src/test/fixtures/tls");
const fixture = (name: string) => path.join(fixtures, name);

function startServer(requireClientCertificate: boolean): Promise<{ server: https.Server; url: string }> {
	const options: https.ServerOptions = {
		key: fs.readFileSync(fixture("server.key")),
		cert: fs.readFileSync(fixture("server.crt")),
	};

	if (requireClientCertificate) {
		options.ca = fs.readFileSync(fixture("ca.crt"));
		options.requestCert = true;
		options.rejectUnauthorized = true;
	}

	const server = https.createServer(options, (_request, response) => {
		response.writeHead(200, { "Content-Type": "application/json" });
		response.end(JSON.stringify({ ok: true }));
	});

	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			const address = server.address() as AddressInfo;
			resolve({ server, url: `https://127.0.0.1:${address.port}/` });
		});
	});
}

function stopServer(server: https.Server): Promise<void> {
	return new Promise((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
}

suite("TLS fetch", () => {
	let tlsServer: https.Server;
	let tlsUrl: string;
	let mtlsServer: https.Server;
	let mtlsUrl: string;

	setup(async () => {
		({ server: tlsServer, url: tlsUrl } = await startServer(false));
		({ server: mtlsServer, url: mtlsUrl } = await startServer(true));
	});

	teardown(async () => {
		await stopServer(tlsServer);
		await stopServer(mtlsServer);
	});

	test("trusts a custom CA bundle for a server with a self-signed certificate", async () => {
		const tlsFetch = await createTlsFetch({ caPath: fixture("ca.crt") });

		assert.ok(tlsFetch, "expected a TLS-aware fetch when a CA file is configured");

		const response = await tlsFetch(tlsUrl);

		assert.strictEqual(response.status, 200);
		assert.deepStrictEqual(await response.json(), { ok: true });
	});

	test("leaves verification on when no TLS material is configured", async () => {
		const tlsFetch = await createTlsFetch({});

		assert.strictEqual(tlsFetch, undefined, "expected the platform fetch when nothing is configured");
		await assert.rejects(fetch(tlsUrl), "a self-signed server must not be trusted by default");
	});

	test("presents a client certificate to a server that requires mTLS", async () => {
		const tlsFetch = await createTlsFetch({
			caPath: fixture("ca.crt"),
			certPath: fixture("client.crt"),
			keyPath: fixture("client.key"),
		});

		assert.ok(tlsFetch, "expected a TLS-aware fetch when client credentials are configured");

		const response = await tlsFetch(mtlsUrl);

		assert.strictEqual(response.status, 200);
		assert.deepStrictEqual(await response.json(), { ok: true });
	});

	test("fails when a server requires mTLS and no client certificate is configured", async () => {
		const tlsFetch = await createTlsFetch({ caPath: fixture("ca.crt") });

		assert.ok(tlsFetch, "expected a TLS-aware fetch when a CA file is configured");

		await assert.rejects(tlsFetch(mtlsUrl));
	});

	test("requires both a client certificate and its key", async () => {
		await assert.rejects(
			createTlsFetch({ caPath: fixture("ca.crt"), certPath: fixture("client.crt") }),
			/client key/i,
		);
		await assert.rejects(
			createTlsFetch({ caPath: fixture("ca.crt"), keyPath: fixture("client.key") }),
			/client certificate/i,
		);
	});
});
