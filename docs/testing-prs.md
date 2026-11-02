# Testing a pull request

Every same-repository pull request gets a desktop VSIX and a live web workspace in Codespaces.

| Channel | Best for | Not covered |
| --- | --- | --- |
| Desktop VSIX | STDIO, custom CA, mutual TLS, the full desktop host | Browser CORS and the web bundle |
| Web (Codespaces) | Browser CORS, the OAuth callback, the web bundle | STDIO and desktop TLS |

CI comments on the PR with the current run ID, artifact name, and a Codespaces link. The comment updates in place when the PR changes.

## Desktop (VSIX)

Download the artifact from the run and install it into a dedicated profile so it does not replace the Marketplace build:

```bash
gh run download <run-id> -n mcp-inspector-vsix
code --profile "MCP PR <number>" --install-extension mcp--inspector-*.vsix
code --profile "MCP PR <number>"
```

You can also download `mcp-inspector-vsix` from the **Artifacts** section of the workflow run.

Remove the preview build when done:

```bash
code --profile "MCP PR <number>" --uninstall-extension DhananjaySenday.mcp--inspector
```

Artifacts are kept for 14 days.

## Web (live, Codespaces)

The PR comment links to a Codespace for the branch. In its terminal:

```bash
yarn install
yarn compile-web
npx vscode-test-web --browser none --host 0.0.0.0 --port 3000 --extensionDevelopmentPath=.
```

Then open the forwarded **3000** port from the **Ports** tab. Set the port to **Public** there if you need to share it.

The forwarded URL serves the complete VS Code Web with the branch's extension already loaded. The first run downloads the VS Code web build into `.vscode-test-web`; give it a few minutes. Stop the Codespace when you are done.

To start one manually, use:

```text
https://codespaces.new/Dhananjay-JSR/mcp-inspector/tree/<branch>?quickstart=1
```

## Web (local)

For a faster loop, use one of these:

```bash
# Chromium harness with the extension loaded
yarn test:web

# Interactive full editor in Chromium
yarn compile-web
npx vscode-test-web --browser chromium --extensionDevelopmentPath=. --open-devtools
```

Or run **Run and Debug -> Run Web Extension** to load the web bundle into a web extension host inside desktop VS Code.

## Why vscode.dev sideloading is not used

`vscode.dev` restricts where it will load extension resources. Its `Content-Security-Policy` `connect-src` directive allows Marketplace/CDN origins and `localhost` only. A hosted PR preview (GitHub Pages, jsDelivr, or a relay) is blocked before the manifest loads, and the command reports **Cannot find a valid extension from the location**.

`localhost` is allowed by the CSP, but current Chromium also enforces Private Network Access for a public HTTPS page reaching a loopback address. That path is not reliable enough for reviewers. Codespaces serves the whole editor from the forwarded origin, so the extension is same-origin and no CSP exception is needed.

Marketplace pre-release publishing is for main-branch builds, not per-PR review builds.

## Fork pull requests

Fork PRs receive a read-only `GITHUB_TOKEN`, and the branch lives in the fork, so the PR comment and Codespaces link are skipped. A maintainer can cherry-pick the branch into this repository to test it.

## Safety

- The live workspace link is produced only for branches in this repository.
- A preview is the PR author's code. Only run previews from PRs you trust.
- PR builds are never published to the Marketplace.
