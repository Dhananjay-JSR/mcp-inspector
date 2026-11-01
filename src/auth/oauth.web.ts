import * as vscode from "vscode";
import type { CallbackResult, OAuthCallback } from "./provider";
import { SecretStorageOAuthProvider, supportsOAuth } from "./provider";

export type { CallbackResult, OAuthCallback } from "./provider";
export { SecretStorageOAuthProvider, supportsOAuth };

const CALLBACK_PATH = "/mcp-oauth-callback";
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
// Must match `publisher.name` in package.json so the URI handler authority is ours.
const EXTENSION_ID = "DhananjaySenday.mcp--inspector";

/** Active callbacks, so the single URI handler can route by state. */
const activeCallbacks = new Set<WebOAuthCallback>();

interface PendingFlow {
  expectedState: string | undefined;
  handle: (result: CallbackResult) => void;
}

/**
 * Registers the one URI handler allowed per extension. Called during web
 * activation, before any sign-in starts. In the web extension host the
 * callback arrives as a `vscode://` URI whose query holds `code`/`state`;
 * in vscode.dev/Codespaces `asExternalUri` turns the same URI into an HTTPS
 * URL that VS Code routes back to the extension host.
 */
export function registerWebOAuthHandler(): vscode.Disposable {
  return vscode.window.registerUriHandler({
    handleUri(uri: vscode.Uri): void {
      if (!uri.path.endsWith(CALLBACK_PATH)) {
        return;
      }

      const params = new URLSearchParams(uri.query);
      const states = params.getAll("state");
      const result: CallbackResult = {
        code: params.get("code") ?? undefined,
        state: states.length > 0 ? states[states.length - 1] : null,
        error:
          params.get("error_description") ??
          params.get("error") ??
          undefined,
      };

      const matching = [...activeCallbacks].filter((callback) =>
        callback.matchesState(states),
      );

      if (matching.length > 0) {
        matching[0].deliver(result);
        return;
      }

      // An error response can arrive without a state. If only one sign-in is
      // waiting, hand it over so the waiting promise rejects with the reason.
      if (activeCallbacks.size === 1) {
        [...activeCallbacks][0].deliver(result);
      }
    },
  });
}

/** Packs a URL into the relay callback path without a query string. */
function encodeCallbackTarget(target: string): string {
  const bytes = new TextEncoder().encode(target);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * vscode-test-web serves the URI-callback page at /callback but leaves
 * callbackRoute out of its workbench configuration, so asExternalUri points at
 * the root and percent-encodes the separators in its query
 * (`?vscode-reqid%3D1%26...`). The callback page cannot parse that, so rebuild
 * the URL for local sessions. The production build already returns a usable
 * callback URL and is left untouched.
 */
export function withLocalCallbackRoute(external: vscode.Uri): string {
  const url = new URL(external.toString());
  if (
    url.pathname === "/" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  ) {
    let query: string;
    try {
      query = decodeURIComponent(url.search.slice(1));
    } catch {
      return external.toString();
    }
    if (query.split("&").some((part) => part.startsWith("vscode-reqid="))) {
      return `${url.origin}/callback?${query}`;
    }
  }
  return external.toString();
}

/**
 * Web equivalent of `OAuthCallbackServer`. It does not open a socket: the
 * redirect is captured by VS Code's URI handler, and `waitForCode` resolves
 * when the matching callback arrives.
 */
export class WebOAuthCallback implements OAuthCallback {
  private callbackUrl = "";
  private pending: PendingFlow | null = null;
  private result: CallbackResult | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cancellation: vscode.Disposable | null = null;

  constructor(private readonly relayBase?: string) {}

  async start(): Promise<string> {
    if (this.callbackUrl) {
      return this.callbackUrl;
    }

    const base = vscode.Uri.parse(
      `${vscode.env.uriScheme}://${EXTENSION_ID}${CALLBACK_PATH}`,
    );
    const target = withLocalCallbackRoute(
      await vscode.env.asExternalUri(base),
    );

    // A stable HTTPS relay callback avoids authorization servers that reject
    // the editor's ephemeral asExternalUri URL. The target goes in the path:
    // a query parameter would be nested and double-encoded, and some servers
    // reject that when they complete the flow. The relay forwards code/state
    // to the VS Code URI handler.
    this.callbackUrl = this.relayBase
      ? `${this.relayBase.replace(/\/+$/, "")}/oauth/callback/${encodeCallbackTarget(target)}`
      : target;

    activeCallbacks.add(this);
    return this.callbackUrl;
  }

  get url(): string {
    return this.callbackUrl;
  }

  waitForCode(
    expectedState: string | undefined,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    activeCallbacks.add(this);

    return new Promise<string>((resolve, reject) => {
      const cleanup = () => {
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        this.pending = null;
        this.result = null;
        activeCallbacks.delete(this);
        this.cancellation?.dispose();
        this.cancellation = null;
      };

      const finish = (result: CallbackResult) => {
        cleanup();
        if (result.error) {
          reject(new Error(`Authorization failed: ${result.error}`));
          return;
        }
        if (!result.code) {
          reject(new Error("The authorization server returned no code"));
          return;
        }
        if (expectedState && result.state !== expectedState) {
          reject(new Error("Authorization state did not match"));
          return;
        }
        resolve(result.code);
      };

      this.pending = { expectedState, handle: finish };

      if (this.result) {
        const buffered = this.result;
        this.result = null;
        finish(buffered);
        return;
      }

      this.cancellation =
        token?.onCancellationRequested(() => {
          cleanup();
          reject(new Error("Sign-in cancelled"));
        }) ?? null;

      this.timer = setTimeout(() => {
        cleanup();
        reject(new Error("Sign-in timed out after 5 minutes"));
      }, SIGN_IN_TIMEOUT_MS);
    });
  }

  /** Called by the URI handler when a matching callback arrives. */
  deliver(result: CallbackResult): void {
    if (this.pending) {
      this.pending.handle(result);
      return;
    }
    // A fast SSO redirect can arrive before waitForCode starts listening.
    this.result = result;
  }

  /** True when this callback is waiting for one of the supplied states. */
  matchesState(states: string[]): boolean {
    const expected = this.pending?.expectedState;
    return !!expected && states.includes(expected);
  }

  close(): void {
    activeCallbacks.delete(this);
    this.result = null;
    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      pending.handle({ error: "Sign-in cancelled" });
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.cancellation?.dispose();
    this.cancellation = null;
  }
}
