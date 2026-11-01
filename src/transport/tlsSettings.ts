import * as vscode from "vscode";
import type { TlsConfig } from "./tls";

const SECTION = "mcp--inspector";

const SETTING_KEYS: Record<keyof TlsConfig, string> = {
	caPath: "tls.caFile",
	certPath: "tls.clientCertFile",
	keyPath: "tls.clientKeyFile",
};

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
		caPath: settingPath(SETTING_KEYS.caPath),
		certPath: settingPath(SETTING_KEYS.certPath),
		keyPath: settingPath(SETTING_KEYS.keyPath),
	};
}

/** Normalizes values that arrive from the webview into paths or undefined. */
export function normalizeTlsConfig(value: unknown): TlsConfig {
	const source = (value ?? {}) as Partial<Record<keyof TlsConfig, unknown>>;
	const read = (key: keyof TlsConfig): string | undefined => {
		const raw = source[key];
		return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
	};

	return {
		caPath: read("caPath"),
		certPath: read("certPath"),
		keyPath: read("keyPath"),
	};
}

/**
 * Persists the paths so the next connection and the settings UI agree with
 * what the panel shows. Writes to the scope that already defines the value,
 * otherwise to user settings (the paths are machine-specific).
 */
export async function saveTlsConfig(config: TlsConfig): Promise<void> {
	const workspace = vscode.workspace.getConfiguration(SECTION);
	const keys = Object.keys(SETTING_KEYS) as (keyof TlsConfig)[];

	await Promise.all(
		keys.map(async (key) => {
			const setting = SETTING_KEYS[key];
			const next = config[key] ?? "";
			if (workspace.get<string>(setting) === next) {
				return;
			}

			const inspected = workspace.inspect<string>(setting);
			const target =
				inspected?.workspaceValue !== undefined
					? vscode.ConfigurationTarget.Workspace
					: vscode.ConfigurationTarget.Global;
			await workspace.update(setting, next, target);
		}),
	);
}
