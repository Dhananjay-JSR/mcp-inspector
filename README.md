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

- Connect to MCP servers over **STDIO** (a local script) or **SSE** (a URL)
- Browse every tool a server exposes, including its input schema
- Execute tools with custom JSON arguments and inspect the result
- Work from a dedicated sidebar view or a full inspector panel
- Run entirely inside VS Code, with no external tooling

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
   - **STDIO** — enter the path to the MCP server script and optional arguments
   - **SSE** — enter the server URL
4. Connect, select a tool, and run it with JSON arguments.

## Commands

| Command | Description |
| --- | --- |
| `mcp--inspector.createNewRequest` | Open the MCP Inspector panel and start a new request |

## Requirements

- Visual Studio Code `1.98.0` or newer

## VS Code for the Web

MCP Inspector works in `vscode.dev` and `github.dev` for remote **SSE** servers.
STDIO requires the desktop app or Codespaces. See [WEB.md](WEB.md) for CORS
requirements, localhost notes, and relay setup.

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
