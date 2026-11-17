# MCP App fixtures

Every fixture is a zero-dependency stdio MCP server. `_shared/app-server.mjs`
implements the good path; each fixture overrides exactly one thing a check
should catch.

| Fixture | Breaks | Check |
| --- | --- | --- |
| `good-dice` | nothing | baseline |
| `wrong-mime` | `resources/read` returns `text/html` | APP004 |
| `no-ui-declaration` | tool has no `_meta.ui` | APP001 |
| `legacy-only` | only `_meta["ui/resourceUri"]` | APP002 |
| `bad-uri` | resource URI is not `ui://` | APP005 |
| `no-ping` | `ping` returns an error | APP007 |
| `meta-in-structured` | `_meta` inside `structuredContent` | APP006 |
| `no-ui-capability-gate` | UI only when the extension is advertised | APP008 |
| `cdn-script` | View loads a script from `esm.sh` | APP009 |
| `external-origin` | View loads fonts from another origin | APP010 |
| `dotted-name` | tool name contains `.` | APP011 |
| `no-text-content` | result has no text fallback | APP012 |
| `no-structured-content` | result has only text | APP013 |
| `invalid-visibility` | `visibility: ["llm"]` | APP014 |
| `empty-html` | `resources/read` returns empty HTML | APP003 |

More fixtures land with `VIEW001`–`VIEW010`; each one will get its own
`server.mjs` and, where needed, a `view.html`.

## HTTP fixture

`http-dice` serves the same dice app over stateless Streamable HTTP with CORS,
so the web extension tests can connect from a browser:

```bash
node fixtures/http-dice/server.mjs --port 3979
```

`scripts/test-web.mjs` starts it automatically before `vscode-test-web`.

## Run

```bash
node fixtures/smoke.mjs
# or
yarn fixtures:smoke
```

The smoke runner speaks newline-delimited JSON-RPC over stdin/stdout. It does
not need the extension, a browser, or a network.

The preflight checks run against these fixtures from the test suite:

```bash
yarn test
```

## Wire log

Set `FIXTURE_LOG` to capture both directions in a readable file:

```bash
FIXTURE_LOG=/tmp/good-dice.log node fixtures/good-dice/server.mjs
```

`stdout` is the protocol; logs never go there.
