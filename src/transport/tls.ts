import { readFile } from "node:fs/promises";
import { Agent, fetch as undiciFetch } from "undici";
import type { RequestInit as UndiciRequestInit } from "undici";

export interface TlsFetch {
	(url: string | URL, init?: RequestInit): Promise<Response>;
	/** Releases the dispatcher's keep-alive sockets. */
	close(): Promise<void>;
}

/**
 * Filesystem paths for TLS material. Secrets stay on disk and are never
 * stored in settings.
 */
export interface TlsConfig {
	/** PEM bundle of certificate authorities the server chain is verified against. */
	caPath?: string;
	/** PEM client certificate presented to servers that require mTLS. */
	certPath?: string;
	/** PEM private key for the client certificate. */
	keyPath?: string;
}

/**
 * Builds a fetch that verifies the server against a custom CA and/or presents
 * a client certificate. Returns undefined when no TLS material is configured,
 * so callers keep the platform fetch.
 *
 * Server verification is always on. A private CA widens what is trusted; it
 * never turns verification off.
 */
export async function createTlsFetch(config: TlsConfig): Promise<TlsFetch | undefined> {
	if (Boolean(config.certPath) !== Boolean(config.keyPath)) {
		throw new Error(
			config.certPath
				? "A TLS client certificate was configured without its client key."
				: "A TLS client key was configured without its client certificate.",
		);
	}

	const connect: { ca?: Buffer; cert?: Buffer; key?: Buffer } = {};

	if (config.caPath) {
		connect.ca = await readFile(config.caPath);
	}
	if (config.certPath) {
		connect.cert = await readFile(config.certPath);
	}
	if (config.keyPath) {
		connect.key = await readFile(config.keyPath);
	}

	if (Object.keys(connect).length === 0) {
		return undefined;
	}

	const dispatcher = new Agent({ connect });

	return Object.assign(
		(url: string | URL, init?: RequestInit) =>
			undiciFetch(url, {
				...(init as UndiciRequestInit),
				dispatcher,
			}) as unknown as Promise<Response>,
		{ close: () => dispatcher.close() },
	);
}
