// The webview side of the host bridge. The UI only knows `send` and `on`;
// keeping `acquireVsCodeApi` here leaves the platform details in one file.

const vscode = acquireVsCodeApi();

const byCommand = new Map();
const all = new Set();

window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message) {
    return;
  }

  for (const handler of all) {
    handler(message);
  }

  if (typeof message.command === "string") {
    for (const handler of byCommand.get(message.command) ?? []) {
      handler(message.data, message);
    }
  }
});

/** Webview state that survives being hidden. */
export function getState() {
  return vscode.getState();
}

export function setState(state) {
  vscode.setState(state);
}

/** Post a command to the extension host. */
export function send(command, data) {
  vscode.postMessage(data === undefined ? { command } : { command, data });
}

/** Subscribe to one command; the handler receives the payload and the message. */
export function on(command, handler) {
  const handlers = byCommand.get(command) ?? new Set();
  handlers.add(handler);
  byCommand.set(command, handlers);

  return () => {
    handlers.delete(handler);
  };
}

/** Subscribe to every message; the handler receives the whole message. */
export function onAny(handler) {
  all.add(handler);
  return () => {
    all.delete(handler);
  };
}

/** Platform details the host wrote onto <body>. */
export const platform = {
  get isWeb() {
    return document.body?.dataset.isWeb === "true";
  },
  get relayBase() {
    return document.body?.dataset.relayBase ?? "";
  },
};
