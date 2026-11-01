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
[![CodeQL](https://github.com/Dhananjay-JSR/mcp-inspector/actions/workflows/codeql.yml/badge.svg)](https://github.com/Dhananjay-JSR/mcp-inspector/actions/workflows/codeql.yml)

Easily inspect and interact with MCP servers directly from Visual Studio Code—no need to download external inspectors. This extension provides seamless integration for monitoring and debugging MCP protocols within your development environment.


## Usage

1. Click on the MCP Inspector icon in the activity bar
2. Use the "Create New MCP Request" command to start interacting with MCP servers
3. View and manage your MCP operations through extension

## Extension Settings

This extension contributes the following commands:

* `mcp-inspector.createNewRequest`: Create a new MCP request

## Known Issues

Please report any issues on the [GitHub repository](https://github.com/Dhananjay-JSR/mcp-inspector/issues).

## Development

### Prerequisites

- Node.js 20+
- Yarn 1.x

### Scripts

| Command | Description |
| --- | --- |
| `yarn install` | Install dependencies |
| `yarn compile` | Compile the extension with TypeScript |
| `yarn watch` | Compile in watch mode |
| `yarn lint` | Run ESLint |
| `yarn test` | Run the VS Code extension test suite |
| `yarn package` | Build a `.vsix` package |

### Continuous Integration

Every push and pull request to `main` runs the following automated checks:

- **Build & lint** on Ubuntu, macOS, and Windows
- **Extension tests** on Linux using a virtual display (`xvfb`)
- **VSIX packaging** with the packaged extension uploaded as a build artifact

CodeQL security analysis runs on pushes, pull requests, and on a weekly schedule. Dependabot keeps npm and GitHub Actions dependencies up to date.

### Releases

Pushing a tag that matches the `package.json` version triggers the release workflow, which packages the extension, publishes it to the VS Code Marketplace when a `VSCE_PAT` repository secret is configured, and creates a GitHub release with the `.vsix` attached.

```bash
git tag v0.0.4
git push origin v0.0.4
```

## Release Notes

### 0.0.1 (2025-03-29)

Initial release of MCP Inspector with:
- List Tool
- STDIO / SSR Transport Support

### 0.0.2 (2025-03-29)

- Tool Execution Support

## Author

**Dhananjay Senday**
- Website: [https://dhananjaay.dev](https://dhananjaay.dev)
- Email: [hello@dhananjaay.dev](mailto:hello@dhananjaay.dev)


**Enjoy!**
