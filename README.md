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
| `yarn release` | Run semantic-release locally (CI does this automatically) |

### Continuous Integration

Every push and pull request to `main` runs the following automated checks:

- **Build & lint** on Ubuntu, macOS, and Windows
- **Extension tests** on Linux using a virtual display (`xvfb`)
- **VSIX packaging** with the packaged extension uploaded as a build artifact

CodeQL security analysis runs on pushes, pull requests, and on a weekly schedule. Dependabot keeps npm and GitHub Actions dependencies up to date.

Pull request titles are validated against [Conventional Commits](https://www.conventionalcommits.org/) because squash merges use the PR title as the commit message on `main`.

### Automated Releases

Releases are fully automated with [semantic-release](https://semantic-release.gitbook.io/). After CI passes on `main`, the release workflow inspects the commits since the last tag and creates a release only when a change warrants one:

| Commit type | Example | Version bump |
| --- | --- | --- |
| `fix:` | `fix: handle SSE reconnect` | Patch (`0.0.3` → `0.0.4`) |
| `feat:` | `feat: add tool call support` | Minor (`0.0.4` → `0.1.0`) |
| `feat!:` / `BREAKING CHANGE:` | `feat!: redesign transport API` | Major (`0.1.0` → `1.0.0`) |
| `chore:`, `docs:`, `ci:`, `test:`, `build:` | `docs: update usage` | No release |

The workflow then:

1. Bumps `package.json` and updates `CHANGELOG.md`
2. Commits the release and creates the `v<version>` tag
3. Builds `mcp-inspector-<version>.vsix`
4. Publishes a GitHub release with the VSIX attached
5. Publishes to the VS Code Marketplace when a `VSCE_PAT` repository secret is configured

No manual tagging is required. Configure `VSCE_PAT` under **Settings → Secrets and variables → Actions** to also publish to the Marketplace.

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
