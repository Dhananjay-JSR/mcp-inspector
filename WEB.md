# MCP Inspector in VS Code for the Web

MCP Inspector runs in [vscode.dev](https://vscode.dev) and
[github.dev](https://github.dev). The UI, tool discovery, and tool execution all
work there, with one hard limit: the browser cannot start local processes, so
**STDIO is only available in the desktop app or in Codespaces**.

| Feature | Desktop | vscode.dev / github.dev |
| --- | --- | --- |
| Sidebar and inspector panel | Yes | Yes |
| Connect over SSE | Yes | Yes |
| STDIO servers | Yes | No (disabled) |
| Local servers | Yes | Best-effort only |

## Connect to a remote SSE server

1. Open `https://vscode.dev` and install MCP Inspector.
2. Run **Create New MCP Request**.
3. Choose **SSE** and enter the server URL.

The server must allow the browser origin with CORS. At minimum:

```http
Access-Control-Allow-Origin: https://vscode.dev
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Last-Event-ID
Access-Control-Max-Age: 86400
```

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

1. Enter the upstream SSE server URL and connect.
2. If the browser blocks the request (CORS), the inspector shows a prompt:
   **Use relay server to connect?**
3. Accept, and the inspector retries through the read-only relay server at
   `https://mcp-relay.dhananjaay.dev`.

The extension composes the relay URL for you:
`https://mcp-relay.dhananjaay.dev/sse?url=<encoded upstream>`.

The relay is open source:
[MCP Inspector Relay](https://github.com/Dhananjay-JSR/mcp-inspector-relay).
For other MCP clients, the same relay can be used directly:

```text
https://mcp-relay.dhananjaay.dev/sse?url=https%3A%2F%2Fmcp.example.com%2Fsse
```

The `url` value must be URL-encoded:

```js
const relayUrl = `https://mcp-relay.dhananjaay.dev/sse?url=${encodeURIComponent("https://mcp.example.com/sse")}`;
```

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "Failed to fetch" or an immediate connection error | The server did not allow the VS Code origin via CORS |
| Connection works on desktop but not in the browser | Desktop bypasses CORS; the server needs the headers above |
| STDIO option is disabled | Expected in the browser; use desktop or Codespaces |
| Local server fails only in the browser | The server rejected the `https://vscode.dev` origin |

When in doubt, test the server from `https://vscode.dev` with the relay first. If
the relay works, the server is reachable and the problem is CORS.
