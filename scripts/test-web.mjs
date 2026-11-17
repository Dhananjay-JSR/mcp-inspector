import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = 3979;

const fixture = spawn(
  process.execPath,
  [resolve(root, "fixtures/http-dice/server.mjs"), "--port", String(port)],
  { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
);

try {
  await new Promise((ready, failed) => {
    let output = "";
    fixture.stdout.on("data", (chunk) => {
      output += String(chunk);
      if (output.includes(`LISTENING ${port}`)) {
        ready();
      }
    });
    fixture.once("exit", (code) => failed(new Error(`HTTP fixture exited with ${code}`)));
  });

  const test = spawn(
    process.execPath,
    [
      resolve(root, "node_modules/@vscode/test-web/out/server/index.js"),
      "--browserType=chromium",
      "--extensionDevelopmentPath=.",
      "--extensionTestsPath=dist/web-test/suite/index.js",
    ],
    { cwd: root, stdio: "inherit" },
  );

  const code = await new Promise((done) => test.once("exit", (value) => done(value ?? 1)));
  process.exitCode = code;
} finally {
  fixture.kill();
}
