# MCP Inspector

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

- Connect over **STDIO**, **SSE**, or **Streamable HTTP**
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
3. Choose the transport:
   - **STDIO** — pick the server script with **Browse…**, or type a command such as `npx`, then add arguments
   - **SSE** — enter the server URL, for example `https://example.com/sse`
   - **Streamable HTTP** — enter the server URL, for example `https://example.com/mcp`
4. Add headers if the server needs them. For token auth use `Authorization` with `Bearer <token>`.
5. Connect, choose a tool, fill in the generated fields, and run it.

Header values are kept in memory for the session and are not written to workspace
storage, so tokens do not end up on disk.

## Commands

| Command | Description |
| --- | --- |
| `mcp--inspector.createNewRequest` | Open the MCP Inspector panel and start a new request |

## Requirements

- Visual Studio Code `1.98.0` or newer

## VS Code for the Web

MCP Inspector works in `vscode.dev` and `github.dev` for remote **SSE** and
**Streamable HTTP** servers. STDIO requires the desktop app or Codespaces.

If a server does not allow the browser origin, the inspector offers the
open-source relay at `https://mcp-relay.dhananjaay.dev`. See [WEB.md](WEB.md) for
CORS requirements, relay usage, localhost notes, and troubleshooting.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for local setup,
commit conventions, and the pull request process.

## Known Issues

Please report issues on the
[GitHub issue tracker](https://github.com/Dhananjay-JSR/mcp-inspector/issues).

## Author

**Dhananjay Senday**

- Website: [https://dhananjaay.dev](https://dhananjaay.dev)
- Email: [hello@dhananjaay.dev](mailto:hello@dhananjaay.dev)

**Enjoy!**
