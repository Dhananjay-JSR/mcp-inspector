import { run } from "../_shared/app-server.mjs";

run({
  toolResult: {
    content: [{ type: "text", text: "ok" }],
    structuredContent: { value: 3, _meta: { ui: { resourceUri: "ui://dice/view.html" } } },
  },
});
