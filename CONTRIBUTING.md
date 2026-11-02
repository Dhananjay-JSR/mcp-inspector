# Contributing to MCP Inspector

Thanks for taking the time to improve MCP Inspector. This guide covers the local
setup and the conventions that keep releases predictable.

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies with `yarn install`.
3. Compile the extension with `yarn compile`.
4. Open the folder in VS Code and press <kbd>F5</kbd> to launch the Extension
   Development Host. Run `yarn watch` in a terminal for incremental builds.
5. Run the test suite with `yarn test`.

### Project layout

| Path | Purpose |
| --- | --- |
| `src/extension.ts` | Extension activation and command registration |
| `src/views/` | Sidebar provider and inspector webview panel |
| `src/transport/` | MCP client for STDIO and SSE connections |
| `src/test/` | Extension test suite |

## Commit messages

This project follows [Conventional Commits](https://www.conventionalcommits.org/)
because releases are automated from commit messages. CI lints both the PR title
and every commit that reaches `main`.

### Format

```text
<type>(<optional scope>): <subject>

<optional body>

<optional footer>
```

- Use the imperative mood in the subject: `add`, not `added` or `adds`.
- Start the subject with a lowercase letter and do not end it with a period.
- Keep the header at or under 100 characters.
- Use a scope when it helps: `transport`, `views`, `ci`, `deps`.

### Types

| Type | Use for | Release effect |
| --- | --- | --- |
| `feat` | A new feature | Minor |
| `fix` | A bug fix | Patch |
| `perf` | A performance improvement | Patch |
| `refactor` | A change that neither fixes a bug nor adds a feature | None |
| `docs` | Documentation only | None |
| `test` | Tests only | None |
| `build` | Build system or dependencies | None |
| `ci` | CI configuration | None |
| `chore` | Maintenance that does not fit above | None |
| `revert` | Reverting an earlier commit | Patch |

### Examples

```text
fix(transport): reconnect dropped SSE sessions
feat(views): show tool input schemas in the inspector
docs: document the commit conventions
ci: lint commit messages on pull requests
chore(deps): update the MCP SDK to 1.32.2
```

### Breaking changes

Add `!` after the type or scope, and explain the break in a footer:

```text
feat(transport)!: replace the legacy SSE client

BREAKING CHANGE: the constructor now takes a URL object instead of a string.
```

A breaking change produces a **major** release. Keep it for changes that require
users or other contributors to update their code.

### Avoiding bad messages

```text
Fixed the bug            # no type
feat: Added support.     # uppercase subject and trailing period
update stuff             # no type, no useful description
```

### Lint commits locally

```bash
git fetch origin main
yarn lint:commits
```

Or lint a specific range directly:

```bash
npx commitlint --from origin/main --to HEAD --verbose
```

## Pull requests

- Keep each pull request focused on one change.
- Use a Conventional Commit title. Squash merges use the PR title as the commit
  message on `main`, and the **PR Title** workflow rejects non-conventional titles.
- Run `yarn compile`, `yarn lint`, and `yarn test` before opening the PR.
- Make sure CI is green. Releases and Marketplace publishing are triggered only
  after CI succeeds on `main`.
- Maintainers squash merge approved pull requests.

## Testing a pull request

Every same-repository PR gets a VSIX artifact and a Codespaces-ready web
workspace. CI comments on the PR with the current run ID, desktop install
commands, and a Codespaces link. See [docs/testing-prs.md](docs/testing-prs.md)
for the full instructions and the local web harnesses.

Use the desktop build for STDIO and custom TLS; use the Codespaces web workspace
for browser CORS and the OAuth callback. Fork PRs skip the comment because their
token is read-only. `vscode.dev` cannot sideload a hosted PR build because its
CSP only allows Marketplace/CDN origins and localhost.

## Continuous integration

Every push and pull request to `main` runs:

- **Build & lint** on Ubuntu, macOS, and Windows
- **Extension tests** on Linux using a virtual display (`xvfb`)
- **VSIX packaging**, uploaded as a build artifact, plus a PR comment with test instructions
- **Web preview**, run through Codespaces or the local Chromium harness
- **Conventional Commits** checks for the PR title and commit messages
- **CodeQL** security analysis

Dependabot opens weekly updates for npm and GitHub Actions.

## Releases

Releases are fully automated with `semantic-release` and require no manual
tagging. After CI passes on `main`, the next version is derived from the commits
since the last tag, `CHANGELOG.md` is updated, and the tag and GitHub release are
created.

Do not bump `package.json` or create tags manually; that would conflict with the
release workflow.

## Reporting issues

Open an issue at
<https://github.com/Dhananjay-JSR/mcp-inspector/issues> with reproduction steps,
the VS Code version, and the MCP server type (STDIO or SSE).
