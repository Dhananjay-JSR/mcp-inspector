<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/Dhananjay-JSR/mcp-inspector/raw/HEAD/resources/icon-black.png" width="200" height="200">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/Dhananjay-JSR/mcp-inspector/raw/HEAD/resources/icon-white.png" width="200" height="200">
    <img alt="MCP Inspector" src="https://github.com/Dhananjay-JSR/mcp-inspector/raw/HEAD/resources/icon-black.png" width="200" height="200">
  </picture>
  <h1>MCP Inspector</h1>
</div>

[![CI](https://github.com/Dhananjay-JSR/mcp-inspector/actions/workflows/ci.yml/badge.svg)](https://github.com/Dhananjay-JSR/mcp-inspector/actions/workflows/ci.yml)
[![Conventional Commits](https://github.com/Dhananjay-JSR/mcp-inspector/actions/workflows/commitlint.yml/badge.svg)](https://github.com/Dhananjay-JSR/mcp-inspector/actions/workflows/commitlint.yml)
[![CodeQL](https://github.com/Dhananjay-JSR/mcp-inspector/actions/workflows/codeql.yml/badge.svg)](https://github.com/Dhananjay-JSR/mcp-inspector/actions/workflows/codeql.yml)
[![Marketplace](https://vsmarketplacebadges.dev/version/DhananjaySenday.mcp--inspector.svg)](https://marketplace.visualstudio.com/items?itemName=DhananjaySenday.mcp--inspector)
[![Installs](https://vsmarketplacebadges.dev/installs/DhananjaySenday.mcp--inspector.svg)](https://marketplace.visualstudio.com/items?itemName=DhananjaySenday.mcp--inspector)

Inspect, debug and interact with [Model Context Protocol](https://modelcontextprotocol.io)
servers without leaving Visual Studio Code. MCP Inspector connects to a server,
lists the tools it exposes, and lets you run them with your own arguments — no
separate inspector process required.

## Features

- Connect to a local server over **STDIO**, or to a remote URL with automatic **Streamable HTTP → SSE** detection
- Sign in to OAuth-protected servers in the desktop app or VS Code for the Web, with tokens kept in VS Code SecretStorage
- Add custom headers per server, including `Authorization: Bearer …` tokens
- Pick a server script with the native file dialog, or type a command such as `npx`
- Browse every tool a server exposes, including its input schema
- Execute tools with form fields generated from the schema and inspect the result
- Work from a dedicated sidebar view or a full inspector panel
- Run in the desktop app and in VS Code for the Web, with a relay fallback when a server blocks the browser origin

## Installation

Install **MCP Inspector** from the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=DhananjaySenday.mcp--inspector),
or download the latest `.vsix` from
[GitHub Releases](https://github.com/Dhananjay-JSR/mcp-inspector/releases) and run:

```bash
code --install-extension mcp-inspector-<version>.vsix
```

## Usage

1. Select the **MCP Inspector** icon in the activity bar.
2. Run the **Create New MCP Request** command from the Command Palette.
3. Choose the server type:
   - **Local (STDIO)** — pick the server script with **Browse…**, or type a command such as `npx`, then add arguments
   - **Remote (URL)** — enter the endpoint, for example `https://example.com/mcp`
4. Choose how to authenticate:
   - **Automatic (browser sign-in)** — if the server answers `401`, the inspector opens its sign-in page
   - **Static header / token** — add an `Authorization` header below; no sign-in flow starts
5. Connect, choose a tool, fill in the generated fields, and run it.

Remote endpoints are tried as Streamable HTTP first, then SSE. A URL ending in
`/sse` is tried as SSE first. The status line names the transport that worked.

Header values are kept in memory for the session and are not written to workspace
storage, so header values do not end up on disk.

### OAuth sign-in

Some remote servers answer `401` and require OAuth. Connect as usual: the
inspector opens the server's sign-in page, waits for the redirect, and retries
the connection when you finish. To skip sign-in, select **Authentication** →
**Static header / token** and add an `Authorization: Bearer …` header.

Client registrations, PKCE verifiers, and tokens are kept in VS Code
SecretStorage, scoped to the server's origin and path. They are never written to
workspace files or webview state.

In VS Code for the Web, the server's OAuth endpoints must allow the editor's
origin via CORS. If they do not, the built-in relay can proxy them; while
proxying it can see the authorization code and token response but does not store
or log them. See [WEB.md](https://github.com/Dhananjay-JSR/mcp-inspector/blob/main/WEB.md) for the relay flow, required CORS headers, and
the static-token alternative.

## Commands

| Command | Description |
| --- | --- |
| `mcp--inspector.createNewRequest` | Open the MCP Inspector panel and start a new request |

## Requirements

- Visual Studio Code `1.98.0` or newer

## VS Code for the Web

MCP Inspector works in `vscode.dev` and `github.dev` for remote servers, using
the same automatic Streamable HTTP / SSE detection. OAuth sign-in works there
too; STDIO requires the desktop app or Codespaces.

If a server does not allow the browser origin, the inspector offers the
open-source relay at `https://mcp-relay.dhananjaay.dev`. See [WEB.md](https://github.com/Dhananjay-JSR/mcp-inspector/blob/main/WEB.md) for
CORS requirements, relay usage, localhost notes, and troubleshooting.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](https://github.com/Dhananjay-JSR/mcp-inspector/blob/main/CONTRIBUTING.md) for local setup,
commit conventions, and the pull request process.

## Known Issues

Please report issues on the
[GitHub issue tracker](https://github.com/Dhananjay-JSR/mcp-inspector/issues).

## License

[MIT](https://github.com/Dhananjay-JSR/mcp-inspector/blob/main/LICENSE)

## Author

**Dhananjay Senday**

- Website: [https://dhananjaay.dev](https://dhananjaay.dev)
- Email: [hello@dhananjaay.dev](mailto:hello@dhananjaay.dev)

**Enjoy!**
