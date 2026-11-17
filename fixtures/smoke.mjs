import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function connect(fixture) {
  const child = spawn(process.execPath, [join(here, fixture, "server.mjs")], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const pending = new Map();
  let nextId = 1;

  createInterface({ input: child.stdout }).on("line", (line) => {
    if (!line.trim()) {
      return;
    }
    const message = JSON.parse(line);
    const entry = pending.get(message.id);
    if (!entry) {
      return;
    }
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) {
      entry.reject(new Error(message.error.message));
    } else {
      entry.resolve(message.result);
    }
  });

  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }, 3000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
      );
    });

  return { request, close: () => child.kill() };
}

const cases = [
  {
    fixture: "good-dice",
    async run(client) {
      const init = await client.request("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "smoke", version: "1.0.0" },
      });
      assert(init.serverInfo?.name === "dice-demo", "serverInfo.name");

      const { tools } = await client.request("tools/list", {});
      assert(
        tools?.[0]?._meta?.ui?.resourceUri === "ui://dice/view.html",
        "_meta.ui.resourceUri",
      );

      const read = await client.request("resources/read", {
        uri: "ui://dice/view.html",
      });
      assert(
        read.contents?.[0]?.mimeType === "text/html;profile=mcp-app",
        "app MIME type",
      );
      assert(
        read.contents?.[0]?.text?.includes("ui/initialize"),
        "view script present",
      );

      await client.request("ping", {});
    },
  },
  {
    fixture: "wrong-mime",
    async run(client) {
      const read = await client.request("resources/read", {
        uri: "ui://dice/view.html",
      });
      assert(read.contents?.[0]?.mimeType === "text/html", "wrong MIME");
    },
  },
  {
    fixture: "no-ui-declaration",
    async run(client) {
      const { tools } = await client.request("tools/list", {});
      assert(tools?.[0]?._meta === undefined, "no tool _meta");
    },
  },
  {
    fixture: "legacy-only",
    async run(client) {
      const { tools } = await client.request("tools/list", {});
      assert(
        tools?.[0]?._meta?.["ui/resourceUri"] === "ui://dice/view.html" &&
          tools?.[0]?._meta?.ui === undefined,
        "legacy key only",
      );
    },
  },
  {
    fixture: "bad-uri",
    async run(client) {
      const { tools } = await client.request("tools/list", {});
      assert(
        tools?.[0]?._meta?.ui?.resourceUri?.startsWith("https://"),
        "non-ui URI",
      );
    },
  },
  {
    fixture: "no-ping",
    async run(client) {
      let failed = false;
      try {
        await client.request("ping", {});
      } catch {
        failed = true;
      }
      assert(failed, "ping returns an error");
    },
  },
];

function assert(value, label) {
  if (!value) {
    throw new Error(`assertion failed: ${label}`);
  }
}

let failures = 0;

for (const { fixture, run } of cases) {
  const client = connect(fixture);
  try {
    await run(client);
    console.log(`ok   ${fixture}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${fixture}: ${error.message}`);
  } finally {
    client.close();
  }
}

console.log(
  failures === 0
    ? `\n${cases.length} fixtures passed`
    : `\n${failures} fixture(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
