import esbuild from "esbuild";
import path from "node:path";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * The shared UI imports the Node-capable transport. Swap it for the SSE-only
 * implementation when building for the web extension host, so no Node modules
 * (cross-spawn, node:stream, node:process) enter the browser bundle.
 */
const webTransportAlias = {
  name: "web-transport-alias",
  setup(build) {
    build.onResolve({ filter: /(^|\/)transport\/MCPTransport$/ }, () => ({
      path: path.resolve("src/transport/MCPTransport.web.ts"),
    }));
  },
};

const context = await esbuild.context({
  entryPoints: ["src/web/extension.ts"],
  outfile: "dist/web/extension.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  mainFields: ["browser", "module", "main"],
  conditions: ["browser"],
  external: ["vscode"],
  define: {
    global: "globalThis",
    ...(production ? { "process.env.NODE_ENV": '"production"' } : {}),
  },
  sourcemap: !production,
  minify: production,
  logLevel: "info",
  plugins: [webTransportAlias],
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
