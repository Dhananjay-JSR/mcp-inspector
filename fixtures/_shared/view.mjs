/**
 * Generate a small View for the render fixtures. The generated page performs
 * the MCP Apps handshake and reports its height, so a fixture only has to
 * describe the one thing it breaks.
 */
export function view(options = {}) {
  const {
    initialize = true,
    initialized = true,
    size = 220,
    sizeChanges = 1,
    respond = true,
    head = "",
    after = "",
  } = options;

  const config = JSON.stringify({ initialize, initialized, sizeChanges, respond });

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
${head}
<style>body { margin: 0; font: 14px system-ui, sans-serif; } #box { height: ${size}px; padding: 8px; }</style>
</head>
<body>
<div id="box">fixture view</div>
<script>
(function () {
  var cfg = ${config};
  var nextId = 1;
  var pending = {};

  function send(msg) {
    parent.postMessage(msg, "*");
  }

  function request(method, params) {
    return new Promise(function (resolve) {
      var id = nextId++;
      pending[id] = resolve;
      send({ jsonrpc: "2.0", id: id, method: method, params: params });
    });
  }

  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || msg.jsonrpc !== "2.0") {
      return;
    }
    if (msg.id !== undefined && pending[msg.id]) {
      var resolve = pending[msg.id];
      delete pending[msg.id];
      resolve(msg.result);
      return;
    }
    if (msg.id !== undefined && cfg.respond) {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
    }
  });

  ${
    initialize
      ? `(async function () {
    await request("ui/initialize", {
      protocolVersion: "2026-01-26",
      appInfo: { name: "fixture-view", version: "1.0.0" },
      appCapabilities: {},
    });
    ${initialized ? 'send({ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {} });' : ""}
    ${
      sizeChanges > 0
        ? `for (var index = 0; index < ${sizeChanges}; index++) {
      send({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: document.documentElement.scrollHeight } });
    }`
        : ""
    }
    ${after}
  })();`
      : after
  }
})();
</script>
</body>
</html>`;
}
