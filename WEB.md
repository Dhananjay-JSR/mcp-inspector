# MCP Inspector in VS Code for the Web

MCP Inspector runs in [vscode.dev](https://vscode.dev) and
[github.dev](https://github.dev). The UI, tool discovery, and tool execution all
work there, with one hard limit: the browser cannot start local processes, so
**STDIO is only available in the desktop app or in Codespaces**.

| Feature | Desktop | vscode.dev / github.dev |
| --- | --- | --- |
| Sidebar and inspector panel | Yes | Yes |
| Connect over SSE | Yes | Yes |
| Connect over Streamable HTTP | Yes | Yes |
| Custom headers and bearer tokens | Yes | Yes |
| OAuth sign-in | Yes | Yes |
| STDIO servers | Yes | No (disabled) |
| Local servers | Yes | Best-effort only |

## Connect to a remote server

1. Open `https://vscode.dev` and install MCP Inspector.
2. Run **Create New MCP Request**.
3. Choose **Remote (URL)** and enter the server URL.

The transport is detected automatically: Streamable HTTP first, SSE first when
the URL path ends in `/sse`. The status line names the transport that worked.

Most public servers now use Streamable HTTP on a path such as `/mcp`. Legacy
SSE servers use a path such as `/sse`. If one returns `404`, `405`, or `410`,
the inspector tries the other transport before reporting a failure.

### Custom headers and bearer tokens

Both remote transports accept headers. Add a row per header, for example:

```text
Authorization: Bearer <token>
```

Set **Authentication** to **Static header / token** to use a pre-issued token
without starting a sign-in flow. Headers are sent with every request, including
the tool calls. Values are kept in memory only: they are not written to
workspace storage. When the panel is hidden the webview keeps them; after a
reload you re-enter them.

The relay forwards `Authorization` upstream, so the same token works when you
connect through it.

### OAuth-protected servers

OAuth sign-in works in the browser. When a server answers `401`, the inspector
discovers its authorization server, registers a client with PKCE, opens the
sign-in page, waits for the redirect, and retries with the access token. The
client registration, PKCE verifier, and tokens are stored in VS Code
SecretStorage, scoped to the server's origin and path. The callback URL is stored
with the registration, so a changed callback causes a fresh registration instead
of reusing a client the authorization server will reject.

**Direct connections** need CORS on every endpoint the browser calls: protected
resource metadata (`/.well-known/oauth-protected-resource`), authorization
server metadata (`/.well-known/oauth-authorization-server`), dynamic client
registration, and the token endpoint. The authorization server must also accept
the editor's external callback URI, which the inspector registers dynamically.

**Through the relay**, those requests go through `/auth?url=` and the client
registers `https://mcp-relay.dhananjaay.dev/oauth/callback/<base64url target>`
instead. The relay owns the CORS headers, and its callback is a stable HTTPS
redirect that it forwards to VS Code. This covers authorization servers that
send CORS headers on preflight but omit them from the real response.

While proxying, the relay can see the authorization code, the PKCE verifier, and
the token response. It does not store or log them. If that trust model does not
fit, select **Static header / token** and use a pre-issued bearer token, or use
the desktop app, where OAuth talks to the server directly.

The server must allow the browser origin with CORS. At minimum:

```http
Access-Control-Allow-Origin: https://vscode.dev
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Last-Event-ID, Mcp-Session-Id, Mcp-Protocol-Version
Access-Control-Expose-Headers: Mcp-Session-Id, Mcp-Protocol-Version
Access-Control-Max-Age: 86400
```

`DELETE` and the session headers are needed by Streamable HTTP; SSE servers can
ignore them.

`github.dev` and `insiders.vscode.dev` use their own origins; add them too if you
use those editors.

If the server does not send these headers, the browser blocks the request before
it is sent and the inspector shows a connection error. This is a server-side
configuration issue, not an extension bug.

## Local servers and localhost

`http://localhost` MCP servers are **best-effort** from the web. The browser can
reach localhost, but the server still has to allow `https://vscode.dev` in its
CORS configuration, and many MCP servers reject unknown origins to prevent DNS
rebinding. For reliable local work, use the desktop app or Codespaces.

## Relay for servers without CORS

If you cannot change the server's CORS configuration, the web inspector offers
the relay after a failed direct connection:

1. Enter the upstream server URL and connect.
2. If the browser blocks the request (CORS), the inspector shows a prompt:
   **Use relay server to connect?**
3. Accept, and the inspector retries through the read-only relay server at
   `https://mcp-relay.dhananjaay.dev`.

The extension composes the relay URL for you and tries both paths, starting
with the transport the URL suggests:

```text
SSE              https://mcp-relay.dhananjaay.dev/sse?url=<encoded upstream>
Streamable HTTP  https://mcp-relay.dhananjaay.dev/mcp?url=<encoded upstream>
```

The relay is open source:
[MCP Inspector Relay](https://github.com/Dhananjay-JSR/mcp-inspector-relay).
For other MCP clients, the same relay can be used directly:

```text
https://mcp-relay.dhananjaay.dev/sse?url=https%3A%2F%2Fmcp.example.com%2Fsse
https://mcp-relay.dhananjaay.dev/mcp?url=https%3A%2F%2Fmcp.example.com%2Fmcp
```

The `url` value must be URL-encoded:

```js
const relayUrl = `https://mcp-relay.dhananjaay.dev/mcp?url=${encodeURIComponent("https://mcp.example.com/mcp")}`;
```

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "Failed to fetch" or an immediate connection error | The server did not allow the VS Code origin via CORS |
| Connection works on desktop but not in the browser | Desktop bypasses CORS; the server needs the headers above |
| STDIO option is disabled | Expected in the browser; use desktop or Codespaces |
| Local server fails only in the browser | The server rejected the `https://vscode.dev` origin |
| `404` or `410` on connect | Wrong endpoint or transport: try `/mcp` (Streamable HTTP) instead of `/sse` |
| `405 Method Not Allowed` | The URL is the host root; a Streamable HTTP server usually lives at `/mcp` |
| `401` with a header set | The token or header name is wrong; the value is not shown back to you |
| "Sign-in did not complete" in the browser | The server's OAuth endpoints likely block the browser origin via CORS; use the desktop app or a pre-issued bearer token |

When in doubt, test the server from `https://vscode.dev` with the relay first. If
the relay works, the server is reachable and the problem is CORS.
