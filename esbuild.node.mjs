import esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * Packages the desktop extension as one file. `vscode` is supplied by the
 * extension host; everything else, including the MCP SDK, is bundled so the
 * VSIX does not need to ship node_modules.
 */
const context = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  outfile: "out/extension.js",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
