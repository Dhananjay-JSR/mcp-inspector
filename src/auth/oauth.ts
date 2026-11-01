import * as http from "node:http";
import * as vscode from "vscode";
import type { OAuthCallback } from "./provider";
import { SecretStorageOAuthProvider, supportsOAuth } from "./provider";

export type { CallbackResult, OAuthCallback } from "./provider";
export { SecretStorageOAuthProvider, supportsOAuth };

const CALLBACK_PATH = "/callback";
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>MCP Inspector</title>
<style>body{font-family:system-ui,sans-serif;margin:64px auto;max-width:32rem;line-height:1.5}
h1{font-size:1.1rem}</style></head>
<body><h1>Signed in</h1><p>You can close this tab and return to VS Code.</p></body></html>`;

const FAILURE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>MCP Inspector</title>
<style>body{font-family:system-ui,sans-serif;margin:64px auto;max-width:32rem;line-height:1.5}
h1{font-size:1.1rem}</style></head>
<body><h1>Sign-in failed</h1><p>Return to VS Code for details.</p></body></html>`;

/**
 * Loopback HTTP server that receives the OAuth redirect. It binds to 127.0.0.1
 * on an ephemeral port, accepts a single callback, and shuts down when the
 * connection attempt finishes so nothing keeps listening.
 */
export class OAuthCallbackServer implements OAuthCallback {
  private server: http.Server | null = null;
  private callbackUrl = "";
  private result: import("./provider").CallbackResult | null = null;
  private waiter: { resolve: () => void } | null = null;
  private timer: NodeJS.Timeout | null = null;

  async start(): Promise<string> {
    if (this.server) {
      return this.callbackUrl;
    }

    const server = http.createServer((request, response) => this.handle(request, response));
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    this.callbackUrl = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
    this.server = server;
    return this.callbackUrl;
  }

  get url(): string {
    return this.callbackUrl;
  }

  waitForCode(
    expectedState: string | undefined,
    token?: vscode.CancellationToken,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const cleanup = () => {
        if (this.timer) {
          clearTimeout(this.timer);
          this.timer = null;
        }
        this.waiter = null;
        cancellation?.dispose();
      };
      const finish = (result: import("./provider").CallbackResult) => {
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

      const cancellation = token?.onCancellationRequested(() => {
        cleanup();
        reject(new Error("Sign-in cancelled"));
      });

      this.timer = setTimeout(() => {
        cleanup();
        reject(new Error("Sign-in timed out after 5 minutes"));
      }, SIGN_IN_TIMEOUT_MS);

      this.waiter = { resolve: () => finish(this.result as import("./provider").CallbackResult) };

      if (this.result) {
        finish(this.result);
      }
    });
  }

  close(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.waiter = null;
    this.server?.close();
    this.server = null;
  }

  private handle(request: http.IncomingMessage, response: http.ServerResponse): void {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== CALLBACK_PATH) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const code = url.searchParams.get("code") ?? undefined;
    const error = url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? undefined;
    this.result = { code, state: url.searchParams.get("state"), error };

    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(code ? SUCCESS_HTML : FAILURE_HTML);

    this.waiter?.resolve();
  }
}
