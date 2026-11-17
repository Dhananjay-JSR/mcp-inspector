import esbuild from "esbuild";
import path from "node:path";
import { coreSource, patchCfworkerBaseUri } from "./esbuild.core.mjs";

const webTransportAlias = {
  name: "web-transport-alias",
  setup(build) {
    build.onResolve({ filter: /(^|\/)transport\/MCPTransport$/ }, () => ({
      path: path.resolve("src/transport/MCPTransport.web.ts"),
    }));
  },
};

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["src/web/test/suite/index.ts"],
  outfile: "dist/web-test/suite/index.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  mainFields: ["browser", "module", "main"],
  conditions: ["browser"],
  external: ["vscode"],
  define: {
    global: "globalThis",
  },
  sourcemap: !production,
  minify: production,
  logLevel: "info",
  plugins: [coreSource, patchCfworkerBaseUri, webTransportAlias],
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
