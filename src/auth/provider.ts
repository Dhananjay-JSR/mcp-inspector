import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import * as vscode from "vscode";

export interface CallbackResult {
  code?: string;
  state?: string | null;
  error?: string;
}

/**
 * The piece that receives the OAuth redirect. Desktop uses a loopback HTTP
 * server; the web build uses a VS Code URI handler. Both satisfy this shape so
 * the provider and token storage stay identical.
 */
export interface OAuthCallback {
  readonly url: string;
  waitForCode(
    expectedState: string | undefined,
    token?: vscode.CancellationToken,
  ): Promise<string>;
  close(): void;
}

interface StoredCredentials {
  clientInformation?: OAuthClientInformationMixed;
  /** The callback URL this client was registered with. */
  clientRedirectUrl?: string;
  tokens?: OAuthTokens;
  codeVerifier?: string;
}

/**
 * Generates the OAuth `state` without importing `node:crypto`, so the same
 * provider runs in the desktop extension host and in the web worker. The web
 * worker and Node 20+ both expose `globalThis.crypto`.
 */
function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  const webCrypto = (
    globalThis as {
      crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
    }
  ).crypto;
  if (!webCrypto?.getRandomValues) {
    throw new Error("No secure random source is available");
  }
  webCrypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * A stable key per server origin and path. FNV-1a is used so the web bundle
 * never needs `node:crypto`; this only scopes storage, it is not a secret.
 */
function storageKey(serverUrl: URL): string {
  const input = `${serverUrl.origin}${serverUrl.pathname}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `mcp-inspector.oauth.${(hash >>> 0).toString(16)}`;
}

/**
 * Stores client registration, tokens, and the PKCE verifier in SecretStorage,
 * scoped to the MCP server origin and path. Nothing is written to workspace
 * files or webview state. Works on desktop and in VS Code for the Web, where
 * SecretStorage uses the browser's encrypted storage.
 */
export class SecretStorageOAuthProvider implements OAuthClientProvider {
  private expectedState: string | undefined;

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly serverUrl: URL,
    private readonly callback: OAuthCallback,
  ) {}

  get redirectUrl(): string {
    return this.callback.url;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "MCP Inspector for VS Code",
      redirect_uris: [this.callback.url],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  get stateValue(): string | undefined {
    return this.expectedState;
  }

  state(): string {
    this.expectedState = randomHex(16);
    return this.expectedState;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const stored = await this.read();
    // A registered client is bound to the redirect URI it was created with.
    // The web callback carries a per-session VS Code target, so a client from
    // an earlier session (or from a direct connection) no longer matches and
    // the authorization server would reject it with invalid_redirect_uri.
    if (stored.clientRedirectUrl !== this.callback.url) {
      return undefined;
    }
    return stored.clientInformation;
  }

  async saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
    await this.update({ clientInformation, clientRedirectUrl: this.callback.url });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return (await this.read()).tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.update({ tokens });
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.update({ codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const verifier = (await this.read()).codeVerifier;
    if (!verifier) {
      throw new Error("No PKCE verifier saved for this server");
    }
    return verifier;
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(authorizationUrl.toString()));
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): Promise<void> {
    if (scope === "all") {
      await this.secrets.delete(this.storageKey());
      return;
    }
    const stored = await this.read();
    if (scope === "client") {
      delete stored.clientInformation;
      delete stored.clientRedirectUrl;
    } else if (scope === "tokens") {
      delete stored.tokens;
    } else if (scope === "verifier") {
      delete stored.codeVerifier;
    }
    await this.write(stored);
  }

  private storageKey(): string {
    return storageKey(this.serverUrl);
  }

  private async read(): Promise<StoredCredentials> {
    const raw = await this.secrets.get(this.storageKey());
    if (!raw) {
      return {};
    }
    try {
      return JSON.parse(raw) as StoredCredentials;
    } catch {
      return {};
    }
  }

  private async update(patch: Partial<StoredCredentials>): Promise<void> {
    const stored = await this.read();
    await this.write({ ...stored, ...patch });
  }

  private async write(stored: StoredCredentials): Promise<void> {
    await this.secrets.store(this.storageKey(), JSON.stringify(stored));
  }
}

export function supportsOAuth(serverUrl: string | undefined): boolean {
  if (!serverUrl) {
    return false;
  }
  try {
    return new URL(serverUrl).protocol === "https:";
  } catch {
    return false;
  }
}
