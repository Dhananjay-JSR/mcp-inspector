import * as vscode from "vscode";
import type { TlsConfig } from "./tls";

const SECTION = "mcp--inspector";

function settingPath(key: string): string | undefined {
	const value = vscode.workspace.getConfiguration(SECTION).get<string>(key)?.trim();
	return value ? value : undefined;
}

/**
 * Reads the desktop TLS settings. Paths are stored, never certificate or key
 * contents, so workspace settings stay safe to commit and sync.
 */
export function readTlsConfig(): TlsConfig {
	return {
		caPath: settingPath("tls.caFile"),
		certPath: settingPath("tls.clientCertFile"),
		keyPath: settingPath("tls.clientKeyFile"),
	};
}
