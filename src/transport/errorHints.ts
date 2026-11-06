export type FailureKind =
	| "config"
	| "dns"
	| "tls"
	| "cors"
	| "auth"
	| "transport"
	| "protocol"
	| "tool";

export interface FailureDescription {
	kind: FailureKind;
	title: string;
	message: string;
	details: string;
	corsLikely: boolean;
	/** Header-free reproduction command; never contains credentials. */
	curl?: string;
}

const TITLES: Record<FailureKind, string> = {
	config: "Configuration",
	dns: "Host not found",
	tls: "TLS certificate",
	cors: "Blocked by the browser",
	auth: "Authentication",
	transport: "Network",
	protocol: "Protocol",
	tool: "Tool call",
};

function endpointSuggestion(endpoint: URL | null): string {
	if (!endpoint) {
		return "";
	}
	if (endpoint.pathname === "/" || endpoint.pathname === "") {
		return ` Try ${endpoint.origin}/mcp.`;
	}
	return "";
}

/**
 * A curl command that reproduces the request without headers or tokens, so it
 * is safe to paste into a terminal or an issue.
 */
export function buildCurlCommand(endpoint: URL | null): string | undefined {
	if (!endpoint) {
		return undefined;
	}
	const url = endpoint.toString().replace(/'/g, "'\\''");
	return `curl -i '${url}'`;
}

function classify(
	raw: string,
	corsLikely: boolean,
	fallback: FailureKind,
): FailureKind {
	if (corsLikely) {
		return "cors";
	}
	if (/ENOTFOUND|EAI_AGAIN|EAI_NONAME|getaddrinfo|dns lookup/i.test(raw)) {
		return "dns";
	}
	if (
		/certificate|CERT_|UNABLE_TO_VERIFY|SELF_SIGNED|ERR_TLS|\bSSL\b|\bTLS\b/i.test(
			raw,
		)
	) {
		return "tls";
	}
	if (
		/\b(401|403)\b|unauthori[sz]ed|forbidden|invalid_token|invalid_client|www-authenticate/i.test(
			raw,
		)
	) {
		return "auth";
	}
	if (
		/\b(404|405)\b|method not allowed|ENOENT|EACCES|command not found|not executable|must start with http|invalid url/i.test(
			raw,
		)
	) {
		return "config";
	}
	if (
		/unexpected token|invalid json|json parse|parse error|json-rpc|invalid message|unexpected content[- ]?type|sse error/i.test(
			raw,
		)
	) {
		return "protocol";
	}
	if (
		/ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|socket hang up|fetch failed|network|connection refused|timed out/i.test(
			raw,
		)
	) {
		return "transport";
	}
	return fallback;
}

function messageFor(kind: FailureKind, raw: string, endpoint: URL | null): string {
	switch (kind) {
		case "cors":
			return "Could not reach the server. The browser blocked this cross-origin request.";
		case "dns":
			return "The host could not be resolved. Check the server URL and your DNS or network connection.";
		case "tls":
			return "The TLS handshake failed. Check the certificate chain, or the CA and client certificate settings.";
		case "auth":
			if (/invalid_token|expired|access token/i.test(raw)) {
				return "The access token was rejected. Sign in again or check the Authorization header.";
			}
			if (/403|forbidden/i.test(raw)) {
				return "The server refused the request (403). The token may not have access.";
			}
			return "The server rejected the credentials (401). Check the Authorization header.";
		case "config":
			if (/must start with http|invalid url/i.test(raw)) {
				return "The server URL is not valid. It must start with http:// or https://.";
			}
			if (/ENOENT|command not found/i.test(raw)) {
				return "The command or endpoint could not be found. Check the command name and path.";
			}
			if (/EACCES|not executable|permission denied/i.test(raw)) {
				return "The command could not be executed. Check that it is executable and on the PATH.";
			}
			if (/405|method not allowed/i.test(raw)) {
				return `The server rejected the request method (405).${
					endpointSuggestion(endpoint) || " Check the endpoint path."
				}`;
			}
			if (/404|not found/i.test(raw)) {
				return `The endpoint was not found (404).${
					endpointSuggestion(endpoint) || " Check the URL path."
				}`;
			}
			return "Check the endpoint URL or the launch command, then try again.";
		case "protocol":
			return "The server replied with something that is not a valid MCP/JSON-RPC response. Check the endpoint path and content type.";
		case "tool":
			return raw;
		case "transport":
			return "The connection failed before the server responded. Check that the server is running and the URL and port are reachable.";
	}
}

interface DescribeErrorOptions {
	fallbackKind?: FailureKind;
	corsLikely?: boolean;
}

/**
 * The MCP SDK puts the HTTP status in `error.code` and leaves it out of the
 * message, so a 401/403/404 would otherwise look like a generic network error.
 */
export function describeError(
	error: unknown,
	endpoint: URL | null,
	options: DescribeErrorOptions = {},
): FailureDescription {
	const message =
		error instanceof Error ? error.message : "Unknown error occurred";
	const code = (error as { code?: unknown } | null | undefined)?.code;
	const raw =
		typeof code === "number" && !new RegExp(`\\b${code}\\b`).test(message)
			? `${message} (HTTP ${code})`
			: message;

	return describeFailure(
		raw,
		endpoint,
		options.corsLikely ?? false,
		options.fallbackKind ?? "transport",
	);
}

/**
 * Turns a raw transport error into a classified, actionable card while keeping
 * the original text for the details disclosure.
 */
export function describeFailure(
	raw: string,
	endpoint: URL | null,
	corsLikely = false,
	fallbackKind: FailureKind = "transport",
): FailureDescription {
	const kind = classify(raw, corsLikely, fallbackKind);

	return {
		kind,
		title: TITLES[kind],
		message: messageFor(kind, raw, endpoint),
		details: raw,
		corsLikely: kind === "cors",
		curl: buildCurlCommand(endpoint),
	};
}
