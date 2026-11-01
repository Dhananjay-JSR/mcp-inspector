import esbuild from "esbuild";

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
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
