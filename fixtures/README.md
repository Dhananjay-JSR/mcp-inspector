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

More fixtures land with `VIEW001`–`VIEW010`; each one will get its own
`server.mjs` and, where needed, a `view.html`.

## Run

```bash
node fixtures/smoke.mjs
# or
yarn fixtures:smoke
```

The smoke runner speaks newline-delimited JSON-RPC over stdin/stdout. It does
not need the extension, a browser, or a network.

## Wire log

Set `FIXTURE_LOG` to capture both directions in a readable file:

```bash
FIXTURE_LOG=/tmp/good-dice.log node fixtures/good-dice/server.mjs
```

`stdout` is the protocol; logs never go there.
