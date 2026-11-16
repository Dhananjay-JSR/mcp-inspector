import esbuild from "esbuild";
import { coreSource } from "./esbuild.core.mjs";

const production = process.argv.includes("--production");

await esbuild.build({
  entryPoints: ["packages/cli/src/bin.ts"],
  outfile: "packages/cli/dist/cli.js",
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  banner: { js: "#!/usr/bin/env node" },
  sourcemap: !production,
  minify: production,
  logLevel: "info",
  plugins: [coreSource],
});
