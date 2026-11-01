import * as assert from "assert";
import * as http from "node:http";
import * as vscode from "vscode";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  OAuthCallbackServer,
  SecretStorageOAuthProvider,
  supportsOAuth,
} from "../auth/oauth";
import { WebOAuthCallback, withUsableCallbackRoute } from "../auth/oauth.web";

class FakeSecretStorage implements vscode.SecretStorage {
  readonly values = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>();

  readonly onDidChange = this.emitter.event;

  async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.values.set(key, value);
    this.emitter.fire({ key });
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
    this.emitter.fire({ key });
  }

  dispose(): void {
    this.emitter.dispose();
  }
}

/** Sends one request to the loopback callback URL and resolves with the status. */
function hitCallback(url: string, query: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const request = http.get(`${url}?${query}`, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode ?? 0));
    });
    request.once("error", reject);
  });
}

const TOKENS: OAuthTokens = {
  access_token: "access-token",
  token_type: "Bearer",
  expires_in: 3600,
  refresh_token: "refresh-token",
};

suite("OAuth Test Suite", () => {
  test("callback server listens on loopback and accepts the authorization code", async () => {
    const server = new OAuthCallbackServer();
    try {
      const url = await server.start();
      assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/callback$/);

      const pending = server.waitForCode("expected-state");
      const status = await hitCallback(url, "code=abc123&state=expected-state");

      assert.strictEqual(status, 200);
      assert.strictEqual(await pending, "abc123");
    } finally {
      server.close();
    }
  });

  test("callback server rejects a mismatched state", async () => {
    const server = new OAuthCallbackServer();
    try {
      const url = await server.start();
      const pending = server.waitForCode("expected-state");
      await hitCallback(url, "code=abc123&state=wrong-state");

      await assert.rejects(pending, /state did not match/);
    } finally {
      server.close();
    }
  });

  test("callback server surfaces authorization errors", async () => {
    const server = new OAuthCallbackServer();
    try {
      const url = await server.start();
      const pending = server.waitForCode(undefined);
      await hitCallback(url, "error=access_denied&error_description=User+declined");

      await assert.rejects(pending, /User declined/);
    } finally {
      server.close();
    }
  });

  test("callback server rejects a callback without a code", async () => {
    const server = new OAuthCallbackServer();
    try {
      const url = await server.start();
      const pending = server.waitForCode(undefined);
      await hitCallback(url, "state=only-state");

      await assert.rejects(pending, /returned no code/);
    } finally {
      server.close();
    }
  });

  test("callback server returns 404 for other paths", async () => {
    const server = new OAuthCallbackServer();
    try {
      const url = await server.start();
      const otherPath = url.replace("/callback", "/elsewhere");
      const status = await hitCallback(otherPath, "code=abc123");

      assert.strictEqual(status, 404);
    } finally {
      server.close();
    }
  });

  test("callback server honours cancellation", async () => {
    const server = new OAuthCallbackServer();
    const source = new vscode.CancellationTokenSource();
    try {
      await server.start();
      const pending = server.waitForCode(undefined, source.token);
      source.cancel();

      await assert.rejects(pending, /Sign-in cancelled/);
    } finally {
      source.dispose();
      server.close();
    }
  });

  test("web callback resolves a delivered authorization code", async () => {
    const callback = new WebOAuthCallback();
    try {
      const url = await callback.start();
      assert.ok(url, "the web callback should expose an external URL");

      const pending = callback.waitForCode("state-1");
      callback.deliver({ code: "abc123", state: "state-1" });

      assert.strictEqual(await pending, "abc123");
    } finally {
      callback.close();
    }
  });

  test("web callback keeps the relay target out of the query string", async () => {
    const callback = new WebOAuthCallback("https://relay.example");
    try {
      const url = await callback.start();

      assert.match(url, /^https:\/\/relay\.example\/oauth\/callback\/[A-Za-z0-9_-]+$/);
      assert.ok(!url.includes("?"), "the relay callback should not carry a query string");

      const token = url.slice(url.lastIndexOf("/") + 1);
      const decoded = Buffer.from(token, "base64url").toString("utf8");
      assert.match(decoded, /mcp-oauth-callback/);
    } finally {
      callback.close();
    }
  });

  test("local sessions use the harness callback route", () => {
    const local = vscode.Uri.parse(
      "http://localhost:3000/?vscode-reqid=3&vscode-scheme=vscode-insiders",
    );
    const routed = withUsableCallbackRoute(local);
    assert.ok(routed.startsWith("http://localhost:3000/callback?"));
    assert.ok(routed.includes("vscode-reqid=3"));
    assert.ok(!routed.includes("%3D"), "query separators should be plain");

    const production = vscode.Uri.parse(
      "https://vscode.dev/redirect?vscode-reqid=3&vscode-scheme=vscode",
    );
    assert.strictEqual(
      withUsableCallbackRoute(production),
      "https://vscode.dev/redirect?vscode-reqid=3&vscode-scheme=vscode",
    );
  });

  test("decodes a production callback whose query was encoded as one blob", () => {
    const encoded = vscode.Uri.parse(
      "https://vscode.dev/callback?vscode-reqid%3D2%26vscode-scheme%3Dvscode%26vscode-authority%3DDhananjaySenday.mcp--inspector%26vscode-path%3D%252Fmcp-oauth-callback",
    );

    assert.strictEqual(
      withUsableCallbackRoute(encoded),
      "https://vscode.dev/callback?vscode-reqid=2&vscode-scheme=vscode&vscode-authority=DhananjaySenday.mcp--inspector&vscode-path=%2Fmcp-oauth-callback",
    );
  });

  test("leaves unrelated encoded queries alone", () => {
    const unrelated = vscode.Uri.parse(
      "https://example.com/callback?foo%3Dbar",
    );

    assert.strictEqual(
      withUsableCallbackRoute(unrelated),
      unrelated.toString(),
    );
  });

  test("web callback buffers a code that arrives before waitForCode", async () => {
    const callback = new WebOAuthCallback();
    try {
      await callback.start();
      // Simulates an SSO redirect that lands before the connect flow listens.
      callback.deliver({ code: "early", state: "state-1" });

      assert.strictEqual(await callback.waitForCode("state-1"), "early");
    } finally {
      callback.close();
    }
  });

  test("web callback rejects a mismatched state", async () => {
    const callback = new WebOAuthCallback();
    try {
      await callback.start();
      const pending = callback.waitForCode("state-1");
      callback.deliver({ code: "abc123", state: "wrong-state" });

      await assert.rejects(pending, /state did not match/);
    } finally {
      callback.close();
    }
  });

  test("web callback surfaces authorization errors", async () => {
    const callback = new WebOAuthCallback();
    try {
      await callback.start();
      const pending = callback.waitForCode(undefined);
      callback.deliver({ error: "User declined" });

      await assert.rejects(pending, /User declined/);
    } finally {
      callback.close();
    }
  });

  test("web callback rejects a callback without a code", async () => {
    const callback = new WebOAuthCallback();
    try {
      await callback.start();
      const pending = callback.waitForCode(undefined);
      callback.deliver({ state: "only-state" });

      await assert.rejects(pending, /returned no code/);
    } finally {
      callback.close();
    }
  });

  test("web callback close rejects a pending wait", async () => {
    const callback = new WebOAuthCallback();
    await callback.start();
    const pending = callback.waitForCode("state-1");
    callback.close();

    await assert.rejects(pending, /Sign-in cancelled/);
  });

  test("provider round-trips credentials through SecretStorage", async () => {
    const secrets = new FakeSecretStorage();
    const serverUrl = new URL("https://mcp.example.com/mcp");
    const provider = new SecretStorageOAuthProvider(
      secrets,
      serverUrl,
      new OAuthCallbackServer(),
    );

    assert.strictEqual(await provider.clientInformation(), undefined);
    assert.strictEqual(await provider.tokens(), undefined);

    await provider.saveClientInformation({ client_id: "client-1" });
    await provider.saveCodeVerifier("verifier-1");
    await provider.saveTokens(TOKENS);

    assert.deepStrictEqual(await provider.clientInformation(), { client_id: "client-1" });
    assert.strictEqual(await provider.codeVerifier(), "verifier-1");
    assert.deepStrictEqual(await provider.tokens(), TOKENS);
    assert.strictEqual(secrets.values.size, 1, "credentials should share one secret entry");

    secrets.dispose();
  });

  test("provider re-registers when the callback URL changes", async () => {
    const secrets = new FakeSecretStorage();
    const serverUrl = new URL("https://mcp.example.com/mcp");
    const directProvider = new SecretStorageOAuthProvider(
      secrets,
      serverUrl,
      new OAuthCallbackServer(),
    );

    await directProvider.saveClientInformation({ client_id: "direct-client" });
    await directProvider.saveTokens(TOKENS);

    const relayProvider = new SecretStorageOAuthProvider(secrets, serverUrl, {
      url: "https://relay.example/oauth/callback?target=https%3A%2F%2Fvscode.dev%2Fredirect",
      waitForCode: async () => "code",
      close: () => {},
    });

    // A client bound to the old redirect URI must not be reused; WorkOS
    // answers invalid_redirect_uri after sign-in otherwise.
    assert.strictEqual(await relayProvider.clientInformation(), undefined);

    await relayProvider.saveClientInformation({ client_id: "relay-client" });
    assert.deepStrictEqual(await relayProvider.clientInformation(), {
      client_id: "relay-client",
    });

    // Tokens are not tied to the redirect URI, so a re-registration keeps them.
    assert.deepStrictEqual(await relayProvider.tokens(), TOKENS);

    secrets.dispose();
  });

  test("provider scopes credentials per server URL", async () => {
    const secrets = new FakeSecretStorage();
    const first = new SecretStorageOAuthProvider(
      secrets,
      new URL("https://mcp.example.com/mcp"),
      new OAuthCallbackServer(),
    );
    const second = new SecretStorageOAuthProvider(
      secrets,
      new URL("https://mcp.example.com/other"),
      new OAuthCallbackServer(),
    );

    await first.saveTokens(TOKENS);
    assert.strictEqual(await second.tokens(), undefined);

    const otherTokens: OAuthTokens = { ...TOKENS, access_token: "other-token" };
    await second.saveTokens(otherTokens);

    assert.strictEqual((await first.tokens())?.access_token, "access-token");
    assert.strictEqual((await second.tokens())?.access_token, "other-token");
    assert.strictEqual(secrets.values.size, 2);

    secrets.dispose();
  });

  test("invalidateCredentials clears only the requested scope", async () => {
    const secrets = new FakeSecretStorage();
    const provider = new SecretStorageOAuthProvider(
      secrets,
      new URL("https://mcp.example.com/mcp"),
      new OAuthCallbackServer(),
    );

    await provider.saveClientInformation({ client_id: "client-1" });
    await provider.saveTokens(TOKENS);
    await provider.saveCodeVerifier("verifier-1");

    await provider.invalidateCredentials("tokens");
    assert.deepStrictEqual(await provider.clientInformation(), { client_id: "client-1" });
    assert.strictEqual(await provider.tokens(), undefined);
    assert.strictEqual(await provider.codeVerifier(), "verifier-1");

    await provider.invalidateCredentials("all");
    assert.strictEqual(await provider.clientInformation(), undefined);
    assert.strictEqual(await provider.tokens(), undefined);
    await assert.rejects(provider.codeVerifier(), /No PKCE verifier saved/);

    secrets.dispose();
  });

  test("invalidateCredentials handles client and verifier scopes", async () => {
    const secrets = new FakeSecretStorage();
    const provider = new SecretStorageOAuthProvider(
      secrets,
      new URL("https://mcp.example.com/mcp"),
      new OAuthCallbackServer(),
    );

    await provider.saveClientInformation({ client_id: "client-1" });
    await provider.saveTokens(TOKENS);
    await provider.saveCodeVerifier("verifier-1");

    await provider.invalidateCredentials("client");
    assert.strictEqual(await provider.clientInformation(), undefined);
    assert.deepStrictEqual(await provider.tokens(), TOKENS);
    assert.strictEqual(await provider.codeVerifier(), "verifier-1");

    await provider.invalidateCredentials("verifier");
    assert.deepStrictEqual(await provider.tokens(), TOKENS);
    await assert.rejects(provider.codeVerifier(), /No PKCE verifier saved/);

    // Discovery is cached by the SDK, not by the provider, so this is a no-op.
    await provider.invalidateCredentials("discovery");
    assert.deepStrictEqual(await provider.tokens(), TOKENS);

    secrets.dispose();
  });

  test("codeVerifier throws when no verifier was saved", async () => {    const secrets = new FakeSecretStorage();
    const provider = new SecretStorageOAuthProvider(
      secrets,
      new URL("https://mcp.example.com/mcp"),
      new OAuthCallbackServer(),
    );

    await assert.rejects(provider.codeVerifier(), /No PKCE verifier saved/);

    secrets.dispose();
  });

  test("provider generates a fresh state value per call", () => {
    const secrets = new FakeSecretStorage();
    const provider = new SecretStorageOAuthProvider(
      secrets,
      new URL("https://mcp.example.com/mcp"),
      new OAuthCallbackServer(),
    );

    const first = provider.state();
    const second = provider.state();

    assert.match(first, /^[0-9a-f]{32}$/);
    assert.notStrictEqual(first, second);
    assert.strictEqual(provider.stateValue, second);

    secrets.dispose();
  });

  test("supportsOAuth accepts https and rejects everything else", () => {
    assert.strictEqual(supportsOAuth("https://mcp.example.com/mcp"), true);
    assert.strictEqual(supportsOAuth("http://localhost:3000/mcp"), false);
    assert.strictEqual(supportsOAuth("ftp://mcp.example.com/mcp"), false);
    assert.strictEqual(supportsOAuth("not-a-url"), false);
    assert.strictEqual(supportsOAuth(undefined), false);
  });
});
