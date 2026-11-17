import { run } from "../_shared/app-server.mjs";
import { view } from "../_shared/view.mjs";

run({
  viewText: view({ after: 'request("tools/call", { name: "roll_dice", arguments: {} });' }),
  toolResult: { isError: true, content: [{ type: "text", text: "failed" }] },
});
